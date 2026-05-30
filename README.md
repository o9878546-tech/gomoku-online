# 🎮 在线五子棋游戏

一个支持两人实时在线对战的五子棋游戏！

## ✨ 功能特点

- 🎯 经典15×15棋盘
- 👥 两人在线实时对战
- 🔗 通过房间ID邀请好友
- 📱 支持手机和电脑
- 🎨 精美的界面设计

## 🚀 快速开始

### 本地运行

1. 安装依赖：
```bash
npm install
```

2. 启动服务器：
```bash
npm start
```

3. 打开浏览器访问：`http://localhost:3000`

### 游戏玩法

1. **创建房间**：点击"创建房间"按钮，获得房间ID
2. **分享房间**：将房间ID告诉好友
3. **加入房间**：好友输入房间ID，点击"加入房间"
4. **开始游戏**：黑棋先行，轮流落子
5. **获胜条件**：先连成五子的一方获胜

## 🌐 部署指南

### 部署到 Vercel

1. 将代码上传到 GitHub
2. 在 Vercel 中导入项目
3. 自动部署完成

### 部署到 Railway

1. 将代码上传到 GitHub
2. 在 Railway 中新建项目
3. 选择从 GitHub 导入
4. 自动部署完成

## 📁 项目结构

```
gomoku-online/
├── public/          # 前端文件
│   ├── index.html   # 主页面
│   ├── style.css    # 样式
│   └── game.js      # 游戏逻辑
├── server.js        # 后端服务器
├── package.json     # 项目配置
├── vercel.json      # Vercel 配置
└── railway.json     # Railway 配置
```

## 🛠️ 技术栈

- **前端**：HTML5 Canvas + CSS3 + JavaScript
- **后端**：Node.js + Express
- **实时通信**：Socket.IO
- **部署**：支持 Vercel 和 Railway

## 📝 游戏规则

- 黑棋先行
- 轮流落子
- 先连成五子（横、竖、斜）的一方获胜
- 棋盘满未分出胜负则为平局

## 🎉 开始游戏

现在就邀请你的好友来一局五子棋吧！

---

Made with ❤️ by Claude