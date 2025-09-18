const path = require("path");
const sharp = require("sharp");
const { encode } = require("blurhash");
const fs = require("fs");
const ExifParser = require("exif-parser");
const fetch = require("cross-fetch").default;
const { reverseGeocode } = require("./reverseGeocode");

// 异步文件存在检查
const fileExists = (filePath) => {
    return new Promise((resolve) => {
        fs.access(filePath, fs.constants.F_OK, (err) => {
            resolve(!err);
        });
    });
};

// 生成 BlurHash
async function getBlurHash(imagePath) {
    try {
        const { data: pixels, info } = await sharp(imagePath)
            .raw()
            .ensureAlpha()
            .resize(32, 32, { fit: "inside" })
            .toBuffer({ resolveWithObject: true });

        return encode(new Uint8ClampedArray(pixels), info.width, info.height, 4, 4);
    } catch (error) {
        console.error("[imageProcessor] BlurHash 生成失败:", error.message);
        throw error;
    }
}

// 解析 EXIF 数据
async function extractExifData(imagePath) {
    try {
        const buffer = fs.readFileSync(imagePath);
        const parser = ExifParser.create(buffer);
        const result = parser.parse();

        if (!result.tags) {
            return null;
        }

        const tags = result.tags;

        console.log("Tags", tags);
        const exifData = {};

        // 基础相机信息
        if (tags.Make) exifData.camera = {};
        if (tags.Make) exifData.camera.make = tags.Make;
        if (tags.Model) exifData.camera.model = tags.Model;
        if (tags.Software) exifData.camera.software = tags.Software;

        // 拍摄设置
        if (tags.ISO || tags.FNumber || tags.ExposureTime || tags.FocalLength) {
            exifData.settings = {};
        }
        if (tags.ISO) exifData.settings.iso = tags.ISO;
        if (tags.FNumber) exifData.settings.aperture = `f/${tags.FNumber}`;
        if (tags.ExposureTime) {
            // 转换曝光时间为可读格式
            if (tags.ExposureTime < 1) {
                exifData.settings.shutterSpeed = `1/${Math.round(1 / tags.ExposureTime)}`;
            } else {
                exifData.settings.shutterSpeed = `${tags.ExposureTime}s`;
            }
        }
        if (tags.FocalLength) exifData.settings.focalLength = `${tags.FocalLength}mm`;
        if (tags.Flash) exifData.settings.flash = tags.Flash === 1;

        // 日期时间

        exifData.dateTime = parseExifDate(tags.DateTimeOriginal || tags.DateTime);

        // 图片尺寸和方向
        if (tags.ImageWidth) exifData.width = tags.ImageWidth;
        if (tags.ImageHeight) exifData.height = tags.ImageHeight;
        if (tags.Orientation) exifData.orientation = tags.Orientation;

        // GPS 数据
        const gpsData = extractGPSData(tags);
        if (gpsData) {
            exifData.gps = gpsData;
        }

        return Object.keys(exifData).length > 0 ? exifData : null;
    } catch (error) {
        console.warn("[imageProcessor] EXIF 解析失败:", error.message);
        return null;
    }
}
function parseExifDate(dateStr) {
    if (!dateStr) return null;
    // 先尝试直接解析 ISO 格式
    let date = new Date(dateStr);
    if (!isNaN(date.getTime())) return date.toISOString();
    // 尝试 EXIF "YYYY:MM:DD HH:MM:SS" 格式
    const formatted = dateStr.replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3");
    date = new Date(formatted);
    return isNaN(date.getTime()) ? null : date.toISOString();
}
// 提取 GPS 数据
function extractGPSData(tags) {
    if (!tags.GPSLatitude || !tags.GPSLongitude) {
        return null;
    }

    const gps = {
        latitude: tags.GPSLatitude,
        longitude: tags.GPSLongitude,
    };

    // 添加额外的 GPS 信息
    if (tags.GPSAltitude) gps.altitude = tags.GPSAltitude;
    if (tags.GPSTimeStamp) gps.timestamp = tags.GPSTimeStamp;
    if (tags.GPSImgDirection) gps.direction = tags.GPSImgDirection;

    return gps;
}

// 获取图片基础信息
async function getImageMetadata(imagePath) {
    try {
        const metadata = await sharp(imagePath).metadata();

        return {
            width: metadata.width,
            height: metadata.height,
            format: metadata.format,
            size: metadata.size,
            hasAlpha: metadata.hasAlpha,
            colorSpace: metadata.space,
            density: metadata.density,
            aspectRatio: metadata.width && metadata.height ? Math.round((metadata.width / metadata.height) * 100) / 100 : null,
        };
    } catch (error) {
        console.warn("[imageProcessor] 元数据获取失败:", error.message);
        return null;
    }
}

module.exports = ({ strapi }) => ({
    async afterCreate(event) {
        if (event.model.uid !== "plugin::upload.file") return;

        const { result } = event;
        if (result.provider !== "local" || !result.mime?.startsWith("image/")) return;

        // 异步处理，避免阻塞主上传流程
        setImmediate(async () => {
            try {
                console.log("[imageProcessor] 开始处理图片:", result.name);

                // 查找文件路径（使用你现有的逻辑）
                const possiblePaths = [];

                if (result.url && path.isAbsolute(result.url)) {
                    possiblePaths.push(result.url);
                }

                if (strapi.dirs && strapi.dirs.public) {
                    possiblePaths.push(path.join(strapi.dirs.public, result.url));
                }

                if (strapi.config?.server?.dirs?.public) {
                    possiblePaths.push(path.join(strapi.config.server.dirs.public, result.url));
                }

                const publicDir = path.join(process.cwd(), "public");
                possiblePaths.push(path.join(publicDir, result.url));
                possiblePaths.push(path.join(process.cwd(), "public", "uploads", result.hash + result.ext));

                let filePath = null;
                for (const possiblePath of possiblePaths) {
                    if (await fileExists(possiblePath)) {
                        filePath = possiblePath;
                        break;
                    }
                }

                if (!filePath) {
                    console.warn("[imageProcessor] 无法找到文件");
                    return;
                }

                console.log("[imageProcessor] 使用文件路径:", filePath);

                // 并行处理所有任务
                const [blurHashResult, exifResult, metadataResult] = await Promise.allSettled([
                    getBlurHash(filePath),
                    extractExifData(filePath),
                    getImageMetadata(filePath),
                ]);

                // 收集成功的结果
                const updateData = { ...result.provider_metadata };

                // BlurHash
                if (blurHashResult.status === "fulfilled") {
                    updateData.blurHash = blurHashResult.value;
                    console.log("[imageProcessor] BlurHash:", blurHashResult.value);
                } else {
                    console.error("[imageProcessor] BlurHash 失败:", blurHashResult.reason?.message);
                }

                // EXIF 数据
                let locationResult = null;
                if (exifResult.status === "fulfilled" && exifResult.value) {
                    updateData.exif = exifResult.value;
                    console.log("[imageProcessor] EXIF 数据已提取");

                    // 如果有 GPS 数据，进行反向地理编码
                    // 假设 exifResult.value.gps 是 { latitude: xx, longitude: xx }
                    if (exifResult.value.gps) {
                        console.log("[imageProcessor] 发现 GPS 数据，开始反向地理编码...");
                        try {
                            console.log("GPS", exifResult.value.gps);
                            const locationResult = await reverseGeocode(exifResult.value.gps.latitude, exifResult.value.gps.longitude, {
                                // const locationResult = await reverseGeocode(39.90923, 116.397428, {
                                retries: 3, // 重试次数
                                retryDelay: 2000, // 重试间隔 ms
                            });

                            if (locationResult) {
                                // 保存到 updateData
                                updateData.location = locationResult;

                                // 输出城市或格式化地址
                                console.log("[imageProcessor] 地理位置:", locationResult.city || locationResult.formattedAddress);
                            }
                        } catch (err) {
                            console.warn("[imageProcessor] 反向地理编码失败:", err.message);
                        }
                    }
                } else if (exifResult.status === "rejected") {
                    console.warn("[imageProcessor] EXIF 解析失败:", exifResult.reason?.message);
                }

                // 图片元数据
                if (metadataResult.status === "fulfilled" && metadataResult.value) {
                    updateData.metadata = metadataResult.value;
                    console.log("[imageProcessor] 图片元数据已提取");
                }

                // 更新数据库
                await strapi.db.query("plugin::upload.file").update({
                    where: { id: result.id },
                    data: {
                        provider_metadata: updateData,
                    },
                });

                // 总结日志
                const summary = [];
                if (updateData.blurHash) summary.push("BlurHash ✓");
                if (updateData.exif) summary.push("EXIF ✓");
                if (updateData.location) summary.push("GPS ✓");
                if (updateData.metadata) summary.push("Metadata ✓");

                console.log(`[imageProcessor] 处理完成: ${summary.join(", ")}`);
            } catch (err) {
                console.error("[imageProcessor] 处理失败:", err.message);

                // 开发环境下显示详细调试信息
                if (process.env.NODE_ENV === "development") {
                    console.error("[imageProcessor] 调试信息:");
                    console.error("- result.id:", result.id);
                    console.error("- result.name:", result.name);
                    console.error("- result.url:", result.url);
                    console.error("- result.hash:", result.hash);
                    console.error("- result.ext:", result.ext);
                }
            }
        });
    },
});
