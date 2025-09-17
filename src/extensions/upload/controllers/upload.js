
// src/extensions/upload/controllers/upload.js
// throw new Error('[blurHash] 控制器被调用了');
const path = require('path');
const sharp = require('sharp');
const { encode } = require('blurhash');

module.exports = ({ strapi }) => ({
  async upload(ctx) {
    console.error('[blurHash] 控制器进入');

    const result = await strapi.plugin('upload').controller('upload').upload(ctx);
    console.error('[blurHash] 原始上传返回 →', result.name);

    if (result.provider === 'local' && result.mime?.startsWith('image/')) {
      console.error('[blurHash] 开始计算');
      try {
        const uploadDir = strapi.dirs.static.uploads;
        const filePath = path.join(uploadDir, result.hash + result.ext);
        console.error('[blurHash] 绝对路径 →', filePath);

        const { data: pixels, info } = await sharp(filePath)
          .raw()
          .ensureAlpha()
          .resize(32, 32, { fit: 'inside' })
          .toBuffer({ resolveWithObject: true });

        const blurHash = encode(
          new Uint8ClampedArray(pixels),
          info.width,
          info.height,
          4,
          4
        );
        console.error('[blurHash] 计算完成 →', blurHash);

        await strapi.plugin('upload').service('upload').edit(result.id, {
          provider_metadata: { ...result.provider_metadata, blurHash },
        });
        console.error('[blurHash] 已写入数据库');
      } catch (err) {
        console.error('[blurHash] 计算失败', err);
      }
    } else {
      console.error('[blurHash] 跳过（非本地图片或已存在）');
    }

    return result;
  },
});