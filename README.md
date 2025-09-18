# 📸 My SRCAPI Extension  

[![Build](https://img.shields.io/github/actions/workflow/status/augustqin0806/srcapi/ci.yml?branch=main)](https://github.com/augustqin0806/srcapi/actions)
[![Version](https://img.shields.io/github/v/release/augustqin0806/srcapi?sort=semver)](https://github.com/augustqin0806/srcapi/releases)
[![License](https://img.shields.io/github/license/augustqin0806/srcapi)](./LICENSE)
[![Issues](https://img.shields.io/github/issues/augustqin0806/srcapi)](https://github.com/augustqin0806/srcapi/issues)

---

## 📖 项目简介
本项目基于 [srcapi 官方开发流程](./README.srcapi.md)，在此基础上进行了功能扩展，  
目标是在保持原有 API 开发流程的同时，增加实用的 **图片与元数据处理能力**。  

---

## ✨ 新增功能
## ✨ 新增功能
- 🖼️ **BlurHash 生成**：上传图片后自动生成 BlurHash，用于画廊前端占位显示模糊缩略图  
- 🧾 **EXIF 提取**：用户上传本地图片文件，上传后自动解析照片的元数据（如拍摄时间、相机型号、GPS 信息等）  
- 🗺️ **GPS 反向解析**：根据照片 EXIF 中的 GPS 坐标，自动获取对应的城市或地区信息

---

## 🛠️ 后续计划
- 🔍 更多 EXIF 字段解析与格式化  
- 🌐 与地图服务深度集成（如街道、POI 信息）
- ⚙️ 与其他 API 的对接  
- 🚀 逐步增加更多扩展功能  

---

## 📂 文档说明
- [README.srcapi.md](./README.srcapi.md)：原始 srcapi 官方开发流程文档  
- 本 README：项目扩展说明与新功能记录  

---

## 🚀 快速开始
```bash
# 克隆项目
git clone <your-repo-url>

# 安装依赖
npm install   

# 运行
npm start     
