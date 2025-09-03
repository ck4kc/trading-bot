require('dotenv').config();
const WebSocket = require('ws');

class SimpleTradingBot {
    constructor() {
        this.ws = null;
        this.isConnected = false;
        this.appId = process.env.DERIV_APP_ID;
        this.token = process.env.DERIV_TOKEN;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.lastRequestTime = 0;
        this.minRequestInterval = 2000;
        
        // SIMPLE CONFIGURATION
        this.config = {
            symbol: 'R_100',
            tradeAmount: 1,
            maxTradeAmount: 25,
            contractDuration: 3,
            martingaleMultiplier: 2.5,
            profitTarget: 10000,
            stopLoss: 1500,
            minTimeBetweenTrades: 45,
            
            // SIMPLE SIGNAL PARAMETERS
            rsiPeriod: 14,
            rsiOverbought: 70,
            rsiOversold: 30,
            emaPeriod: 20,
        };
        
        this.state = {
            balance: 0,
            dailyProfit: 0,
            consecutiveLosses: 0,
            currentTradeAmount: this.config.tradeAmount,
            isTrading: false,
            lastTradeTime: 0,
            trades: 0,
            wins: 0,
            losses: 0,
            startTime: Date.now(),
            
            prices: [],
            rsiValues: [],
            emaValues: [],
            
            apiErrors: 0
        };
        
        this.init();
    }

    init() {
        console.log('🚀 SIMPLE TRADING BOT - TESTING CONNECTION');
        console.log('═'.repeat(50));
        console.log(`💰 Base Trade: $${this.config.tradeAmount}`);
        console.log(`🚀 Martingale: ${this.config.martingaleMultiplier}x`);
        console.log(`🎯 Daily Target: $${this.config.profitTarget.toLocaleString()}`);
        console.log(`🛑 Daily Stop: $${this.config.stopLoss.toLocaleString()}`);
        console.log(`📊 RSI Levels: ${this.config.rsiOversold}/${this.config.rsiOverbought}`);
        console.log('═'.repeat(50));
        
        this.connect();
        this.setupGracefulShutdown();
    }

    send(data) {
        const now = Date.now();
        if (now - this.lastRequestTime < this.minRequestInterval) {
            setTimeout(() => this.sendImmediate(data), this.minRequestInterval - (now - this.lastRequestTime));
            return;
        }
        this.sendImmediate(data);
    }

    sendImmediate(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            try {
                this.ws.send(JSON.stringify(data));
                this.lastRequestTime = Date.now();
                console.log('📤 Sent:', JSON.stringify(data));
                return true;
            } catch (error) {
                console.error('❌ Send error:', error.message);
                return false;
            }
        } else {
            console.log('⚠️ Cannot send - WebSocket not connected');
            return false;
        }
    }

    connect() {
        if (this.ws) {
            this.ws.removeAllListeners();
            this.ws.close();
        }

        console.log(`🔄 Connecting to Deriv API (attempt ${this.reconnectAttempts + 1})...`);
        
        try {
            this.ws = new WebSocket(`wss://ws.binaryws.com/websockets/v3?app_id=${this.appId}`);
            
            this.ws.on('open', () => {
                console.log('✅ Connected to Deriv API successfully');
                this.isConnected = true;
                this.reconnectAttempts = 0;
                this.state.apiErrors = 0;
                this.authorize();
            });

            this.ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data);
                    console.log('📥 Received:', JSON.stringify(message));
                    this.handleMessage(message);
                } catch (error) {
                    console.error('❌ Error parsing message:', error);
                }
            });

            this.ws.on('error', (error) => {
                console.error('❌ WebSocket error:', error.message);
                this.isConnected = false;
            });

            this.ws.on('close', (code, reason) => {
                console.log(`🔌 WebSocket closed: ${code} - ${reason || 'No reason'}`);
                this.isConnected = false;
            });

        } catch (error) {
            console.error('❌ Failed to create WebSocket:', error);
        }
    }

    handleMessage(message) {
        if (message.error) {
            this.state.apiErrors++;
            console.error(`❌ API Error (${this.state.apiErrors}):`, message.error.message);
            return;
        }

        switch (message.msg_type) {
            case 'authorize':
                console.log(`✅ Authorized: ${message.authorize.loginid}`);
                if (message.authorize.balance) {
                    this.state.balance = parseFloat(message.authorize.balance);
                    console.log(`💰 Current Balance: $${this.state.balance.toFixed(2)}`);
                }
                
                // Try the simplest tick request
                console.log('🔄 Requesting tick data...');
                setTimeout(() => {
                    this.send({ 
                        ticks: this.config.symbol,
                        subscribe: 1
                    });
                }, 2000);
                break;
                
            case 'tick':
                console.log(`📊 Tick received: ${message.tick.quote}`);
                this.handleTick(message);
                break;
                
            case 'proposal':
                this.handleProposal(message);
                break;
                
            case 'buy':
                this.handleBuy(message);
                break;
                
            case 'proposal_open_contract':
                this.handleContractUpdate(message);
                break;
        }
    }

    handleTick(message) {
        const price = parseFloat(message.tick.quote);
        this.state.prices.push(price);
        
        if (this.state.prices.length > 50) {
            this.state.prices.shift();
        }
        
        this.calculateIndicators();
        this.checkForTrade();
    }

    calculateIndicators() {
        if (this.state.prices.length >= this.config.rsiPeriod) {
            this.calculateRSI();
        }
        if (this.state.prices.length >= this.config.emaPeriod) {
            this.calculateEMA();
        }
    }

    calculateRSI() {
        const prices = this.state.prices;
        const period = this.config.rsiPeriod;
        
        if (prices.length < period + 1) return;
        
        let gains = 0, losses = 0;
        
        for (let i = prices.length - period; i < prices.length; i++) {
            const change = prices[i] - prices[i - 1];
            if (change > 0) gains += change;
            else losses += Math.abs(change);
        }
        
        const avgGain = gains / period;
        const avgLoss = losses / period;
        const rs = avgGain / (avgLoss || 0.0001);
        const rsi = 100 - (100 / (1 + rs));
        
        this.state.rsiValues.push(rsi);
        if (this.state.rsiValues.length > 20) {
            this.state.rsiValues.shift();
        }
    }

    calculateEMA() {
        const prices = this.state.prices;
        const period = this.config.emaPeriod;
        const multiplier = 2 / (period + 1);
        
        if (this.state.emaValues.length === 0) {
            const sum = prices.slice(-period).reduce((a, b) => a + b, 0);
            this.state.emaValues.push(sum / period);
        } else {
            const lastEma = this.state.emaValues[this.state.emaValues.length - 1];
            const currentPrice = prices[prices.length - 1];
            const ema = (currentPrice * multiplier) + (lastEma * (1 - multiplier));
            this.state.emaValues.push(ema);
        }
        
        if (this.state.emaValues.length > 20) {
            this.state.emaValues.shift();
        }
    }

    generateSignal() {
        if (this.state.prices.length < 20 || this.state.rsiValues.length < 5) {
            return null;
        }

        const currentRSI = this.state.rsiValues[this.state.rsiValues.length - 1];
        
        // Simple RSI signals
        if (currentRSI <= this.config.rsiOversold) {
            return { type: 'CALL', reason: 'RSI Oversold', strength: 75 };
        }
        
        if (currentRSI >= this.config.rsiOverbought) {
            return { type: 'PUT', reason: 'RSI Overbought', strength: 75 };
        }
        
        return null;
    }

    checkForTrade() {
        // Check stop conditions
        if (this.state.dailyProfit >= this.config.profitTarget) {
            console.log(`\n🎉 DAILY PROFIT TARGET ACHIEVED! $${this.state.dailyProfit.toFixed(2)}`);
            this.shutdown();
            return;
        }
        
        if (this.state.dailyProfit <= -this.config.stopLoss) {
            console.log(`\n🛑 DAILY STOP LOSS HIT! -$${Math.abs(this.state.dailyProfit).toFixed(2)}`);
            this.shutdown();
            return;
        }

        if (this.state.isTrading) return;

        const now = Date.now();
        const minInterval = this.config.minTimeBetweenTrades * 1000;
        
        if (now - this.state.lastTradeTime < minInterval) {
            return;
        }

        const signal = this.generateSignal();
        if (signal) {
            this.executeTrade(signal);
        }
    }

    executeTrade(signal) {
        this.state.isTrading = true;
        this.state.lastTradeTime = Date.now();
        
        console.log(`\n🎯 EXECUTING TRADE #${this.state.trades + 1}`);
        console.log(`📊 Signal: ${signal.type} - ${signal.reason}`);
        console.log(`💵 Amount: $${this.state.currentTradeAmount}`);
        
        this.send({
            proposal: 1,
            amount: this.state.currentTradeAmount,
            basis: 'stake',
            contract_type: signal.type,
            currency: 'USD',
            duration: this.config.contractDuration,
            duration_unit: 't',
            symbol: this.config.symbol
        });
    }

    authorize() {
        this.send({
            authorize: this.token
        });
    }

    handleProposal(message) {
        if (message.proposal) {
            this.send({
                buy: message.proposal.id,
                price: this.state.currentTradeAmount
            });
        }
    }

    handleBuy(message) {
        if (message.buy) {
            this.state.trades++;
            console.log(`✅ Trade executed: Contract ID ${message.buy.contract_id}`);
            
            this.send({
                proposal_open_contract: 1,
                contract_id: message.buy.contract_id,
                subscribe: 1
            });
        }
    }

    handleContractUpdate(message) {
        const contract = message.proposal_open_contract;
        
        if (contract.is_sold) {
            this.handleTradeResult(contract);
        }
    }

    handleTradeResult(contract) {
        const profit = contract.sell_price - contract.buy_price;
        this.state.dailyProfit += profit;
        
        console.log(`\n🏁 TRADE RESULT:`);
        console.log(`💰 Profit/Loss: $${profit.toFixed(2)}`);
        
        if (profit > 0) {
            console.log('🎉 WIN!');
            this.state.wins++;
            this.state.consecutiveLosses = 0;
            this.state.currentTradeAmount = this.config.tradeAmount;
        } else {
            console.log(`❌ LOSS - Applying ${this.config.martingaleMultiplier}x Martingale`);
            this.state.losses++;
            this.state.consecutiveLosses++;
            
            if (this.state.currentTradeAmount < this.config.maxTradeAmount) {
                this.state.currentTradeAmount = Math.min(
                    this.state.currentTradeAmount * this.config.martingaleMultiplier,
                    this.config.maxTradeAmount
                );
                this.state.currentTradeAmount = Math.round(this.state.currentTradeAmount * 100) / 100;
            } else {
                this.state.consecutiveLosses = 0;
                this.state.currentTradeAmount = this.config.tradeAmount;
                this.state.lastTradeTime = Date.now() + 300000; // 5 min break
            }
        }
        
        this.state.isTrading = false;
        this.logStats();
    }

    logStats() {
        console.log('\n📊 SIMPLE BOT STATS');
        console.log('═'.repeat(40));
        console.log(`💰 Balance: $${this.state.balance.toFixed(2)}`);
        console.log(`📈 Daily P&L: $${this.state.dailyProfit.toFixed(2)}`);
        console.log(`🎯 Trades: ${this.state.trades} (${this.state.wins}W/${this.state.losses}L)`);
        
        if (this.state.trades > 0) {
            const winRate = (this.state.wins / this.state.trades * 100).toFixed(1);
            console.log(`📊 Win Rate: ${winRate}%`);
        }
        
        console.log(`💵 Next Trade: $${this.state.currentTradeAmount}`);
        console.log('═'.repeat(40));
    }

    setupGracefulShutdown() {
        process.on('SIGINT', () => {
            console.log('\n🛑 Shutting down gracefully...');
            this.shutdown();
        });

        process.on('SIGTERM', () => {
            console.log('\n🛑 Shutting down gracefully...');
            this.shutdown();
        });
    }

    shutdown() {
        console.log('\n🛑 Shutting down bot...');
        
        if (this.ws) {
            this.ws.close();
        }
        
        console.log('\n📊 FINAL STATISTICS');
        console.log('═'.repeat(40));
        console.log(`💰 Final Balance: $${this.state.balance.toFixed(2)}`);
        console.log(`📈 Final Daily P&L: $${this.state.dailyProfit.toFixed(2)}`);
        console.log(`🎯 Total Trades: ${this.state.trades}`);
        
        if (this.state.trades > 0) {
            const winRate = (this.state.wins / this.state.trades * 100).toFixed(1);
            console.log(`📊 Final Win Rate: ${winRate}%`);
        }
        
        const runtime = (Date.now() - this.state.startTime) / 1000 / 60;
        console.log(`⏱️  Total Runtime: ${runtime.toFixed(1)} minutes`);
        console.log('═'.repeat(40));
        
        process.exit(0);
    }
}

// Start the simple bot
new SimpleTradingBot();