console.log('[blurHash] 上传控制器已覆盖');
const uploadController = require('./controllers/upload');

module.exports = (plugin) => {
  plugin.controllers.upload = uploadController;
  return plugin;
};