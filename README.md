# 🤖 Trading Bot - Railway Deployment

## 🚀 Simple Trading Bot for Binary Options

A working trading bot with clean API connection and 2.5x martingale strategy, optimized for Railway cloud deployment.

### ✅ Features:
- **No API errors** - stable connection tested
- **Simple RSI signals** (30/70 levels) for active trading
- **2.5x martingale recovery** for aggressive profit recovery
- **3-tick contracts** for fast results
- **24/7 continuous trading** in the cloud
- **Real-time monitoring** via Railway dashboard

### 🌐 Railway Deployment:
This bot is specifically configured for Railway with:
- `Procfile` - Railway process configuration
- `railway.json` - Auto-restart and deployment settings
- Environment variable support
- Automatic dependency installation

### 🔧 Required Environment Variables:
Set these in your Railway dashboard:
```
DERIV_APP_ID=your_app_id_here
DERIV_TOKEN=your_token_here
```

### 📊 Expected Performance:
- **24/7 operation** - never stops trading
- **Automatic restarts** if any issues occur
- **Real-time logs** visible in Railway dashboard
- **Cost**: ~$0-5/month (usually covered by free credits)

### 🚀 Quick Deploy:
1. Push this repo to GitHub
2. Connect to Railway
3. Add environment variables
4. Deploy in 30 seconds!