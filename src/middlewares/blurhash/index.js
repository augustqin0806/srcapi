const path = require('path');
const sharp = require('sharp');
const { encode } = require('blurhash');
const fs = require('fs');

async function getBlurHash(imagePath) {
  const { data: pixels, info } = await sharp(imagePath)
    .raw()
    .ensureAlpha()
    .resize(32, 32, { fit: 'inside' })
    .toBuffer({ resolveWithObject: true });
  return encode(new Uint8ClampedArray(pixels), info.width, info.height, 4, 4);
}

/**
 * 
    const image = sharp(imagePath);
    const { data, info } = await image.raw().ensureAlpha().resize(32, 32, { fit: "inside" }).toBuffer({ resolveWithObject: true });
    return encode(new Uint8ClampedArray(data), info.width, info.height, 4, 4);
 */

module.exports = ({ strapi }) => ({
  async afterCreate(event) {
    if (event.model.uid !== 'plugin::upload.file') return;

    const { result } = event;
    if (result.provider !== 'local' || !result.mime?.startsWith('image/')) return;

    try {
      // Multiple fallbacks for finding the correct file path
      let filePath;
      
      // Method 1: Use result.url directly if it's an absolute path
      if (result.url && path.isAbsolute(result.url)) {
        filePath = result.url;
      }
      // Method 2: Try strapi.dirs.public (Strapi v4)
      else if (strapi.dirs && strapi.dirs.public) {
        filePath = path.join(strapi.dirs.public, result.url);
      }
      // Method 3: Try strapi.config.server.dirs.public (alternative)
      else if (strapi.config?.server?.dirs?.public) {
        filePath = path.join(strapi.config.server.dirs.public, result.url);
      }
      // Method 4: Construct from project root + public directory
      else {
        const publicDir = path.join(process.cwd(), 'public');
        filePath = path.join(publicDir, result.url);
      }

      console.log('[blurHash] 尝试文件路径:', filePath);

      // Check if file exists before processing
      if (!fs.existsSync(filePath)) {
        console.warn('[blurHash] 文件不存在:', filePath);
        
        // Try alternative path construction with uploads folder
        const alternativePath = path.join(process.cwd(), 'public', 'uploads', result.hash + result.ext);
        console.log('[blurHash] 尝试备用路径:', alternativePath);
        
        if (fs.existsSync(alternativePath)) {
          filePath = alternativePath;
        } else {
          console.error('[blurHash] 无法找到文件, 跳过处理');
          return;
        }
      }

      const blurHash = await getBlurHash(filePath);

      await strapi.db.query('plugin::upload.file').update({
        where: { id: result.id },
        data: { 
          provider_metadata: { 
            ...result.provider_metadata, 
            blurHash 
          } 
        },
      });
      
      console.log('[blurHash] 计算完成 →', blurHash);
      console.log('[blurHash] 文件路径 →', filePath);
      
    } catch (err) {
      console.error('[blurHash] 失败', err);
      console.error('[blurHash] 调试信息:');
      console.error('- result.url:', result.url);
      console.error('- result.hash:', result.hash);
      console.error('- result.ext:', result.ext);
      console.error('- strapi.dirs:', strapi.dirs);
      console.error('- process.cwd():', process.cwd());
    }
  },
});