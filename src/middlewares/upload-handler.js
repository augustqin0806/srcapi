// src/middlewares/upload-handler.js
const fs = require('fs').promises;
const path = require('path');

module.exports = (config, { strapi }) => {
  return async (ctx, next) => {
    // 只处理上传相关的请求
    if (!ctx.request.url.startsWith('/api/upload') && 
        !ctx.request.url.startsWith('/upload')) {
      return next();
    }

    try {
      // 在请求开始前清理旧的临时文件
      if (process.platform === 'win32') {
        await cleanupOldTempFiles();
      }

      await next();

      // 请求成功后，延迟清理
      if (process.platform === 'win32') {
        setTimeout(() => {
          cleanupOldTempFiles().catch(err => {
            console.warn('[upload-handler] 清理临时文件失败:', err.message);
          });
        }, 5000); // 5秒后清理
      }

    } catch (error) {
      // 即使出错也要尝试清理
      if (process.platform === 'win32') {
        setTimeout(() => {
          cleanupOldTempFiles().catch(() => {});
        }, 1000);
      }
      throw error;
    }
  };
};

async function cleanupOldTempFiles() {
  const tempDirs = [
    process.env.TEMP || process.env.TMP,
    path.join(process.cwd(), 'temp'),
  ];

  for (const tempDir of tempDirs) {
    if (!tempDir) continue;

    try {
      const entries = await fs.readdir(tempDir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.name.startsWith('strapi-upload-')) {
          const fullPath = path.join(tempDir, entry.name);
          try {
            const stats = await fs.stat(fullPath);
            // 删除超过 10 分钟的 strapi 临时文件/文件夹
            if (Date.now() - stats.mtime.getTime() > 600000) {
              if (entry.isDirectory()) {
                await fs.rmdir(fullPath, { recursive: true });
              } else {
                await fs.unlink(fullPath);
              }
              console.log('[upload-handler] 清理临时文件:', entry.name);
            }
          } catch (err) {
            // 忽略清理错误，可能文件正在使用中
          }
        }
      }
    } catch (err) {
      // 忽略目录访问错误
    }
  }
}