// @ts-nocheck
"use strict";

const sharp = require("sharp");
const exifReader = require("exif-reader");
const { encode } = require("blurhash");
const fs = require("fs"); // 仅用于调试

/* ---------- 工具 ---------- */
function toDD([d, m, s], ref) {
    const dd = d + m / 60 + s / 3600;
    return /[SW]/i.test(ref) ? -dd : dd;
}

function streamToBuffer(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on("data", (chunk) => chunks.push(chunk));
        stream.on("end", () => resolve(Buffer.concat(chunks)));
        stream.on("error", reject);
    });
}

/* ---------- Provider ---------- */
module.exports = {
    init(providerOptions) {
        console.log("[Provider] upload-local-with-exif 已加载");

        return {
            async upload(file) {
                console.log("\n[Provider] upload() 被调用:", file.name);

                // 获取完整 buffer
                let buffer;
                if (file.buffer) {
                    buffer = file.buffer;
                    console.log("[DEBUG] file.buffer 已存在，长度:", buffer.length);
                } else if (file.stream) {
                    buffer = await streamToBuffer(file.stream);
                    file.buffer = buffer;
                    console.log("[DEBUG] file.stream 转 buffer 完成，长度:", buffer.length);
                } else {
                    throw new Error("Missing file buffer or stream");
                }

                // 保存一份文件用于调试
                // fs.writeFileSync(`./debug_${file.name}`, buffer);

                // EXIF + BlurHash
                const pm = { ...(file.provider_metadata || {}) };
                try {
                    const meta = await sharp(buffer).metadata();
                    console.log("[DEBUG] metadata keys:", Object.keys(meta));

                    if (meta.exif) {
                        console.log("[DEBUG] meta.exif 长度:", meta.exif.length);
                        const exif = exifReader(meta.exif);
                        console.log("[DEBUG] parsed exif:", exif);

                        pm.exif = {
                            camera: exif.Image?.Make ? { make: exif.Image.Make, model: exif.Image.Model } : undefined,
                            settings: {
                                iso: exif.Photo?.ISOSpeedRatings,
                                aperture: exif.Photo?.FNumber ? `f/${exif.Photo.FNumber}` : undefined,
                                shutterSpeed: exif.Photo?.ExposureTime ? `1/${Math.round(1 / exif.Photo.ExposureTime)}` : undefined,
                                focalLength: exif.Photo?.FocalLength ? `${exif.Photo.FocalLength}mm` : undefined,
                            },
                            dateTime: exif.Photo?.DateTimeOriginal || exif.Image?.DateTime,
                            gps: (() => {
                                if (!exif.GPSInfo?.GPSLatitude || !exif.GPSInfo?.GPSLongitude) return undefined;
                                return {
                                    latitude: toDD(exif.GPSInfo.GPSLatitude, exif.GPSInfo.GPSLatitudeRef),
                                    longitude: toDD(exif.GPSInfo.GPSLongitude, exif.GPSInfo.GPSLongitudeRef),
                                };
                            })(),
                        };

                        console.log("[Provider] EXIF 已解析:", pm.exif);
                    } else {
                        console.warn("[Provider] meta.exif 为空，这张图片可能没有 EXIF 数据");
                    }

                    // BlurHash
                    const { data: pixels, info } = await sharp(buffer)
                        .raw()
                        .ensureAlpha()
                        .resize(32, 32, { fit: "inside" })
                        .toBuffer({ resolveWithObject: true });

                    pm.blurHash = encode(new Uint8ClampedArray(pixels), info.width, info.height, 4, 4);
                    console.log("[Provider] BlurHash 已生成:", pm.blurHash);
                } catch (err) {
                    console.error("[Provider] 解析失败:", err);
                }

                // 挂回 provider_metadata
                file.provider_metadata = pm;

                // 调用官方 local provider 落盘
                const local = (require("@strapi/provider-upload-local").default || require("@strapi/provider-upload-local")).init(
                    providerOptions
                );

                console.log("[Provider] 交给官方 local provider 保存");
                return local.upload(file);
            },

            uploadStream(file) {
                console.log("[Provider] uploadStream() 调用");
                return this.upload(file);
            },

            delete(file) {
                console.log("[Provider] delete() 调用");
                const local = (require("@strapi/provider-upload-local").default || require("@strapi/provider-upload-local")).init(
                    providerOptions
                );
                return local.delete(file);
            },
        };
    },
};
