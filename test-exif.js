// test-exif.js - 测试图片的 EXIF 数据 (使用 exif-reader)
const fs = require("fs");
const sharp = require("sharp");
const exifReader = require("exif-reader");
// @ts-ignore
const path = require("path");

async function testExifData(imagePath) {
    try {
        if (!fs.existsSync(imagePath)) {
            console.error(" 文件不存在:", imagePath);
            return;
        }

        console.log(" 正在分析:", imagePath);

        const buffer = fs.readFileSync(imagePath);
        console.log(" 文件大小:", buffer.length, "bytes");

        // 使用 Sharp 获取元数据
        const image = sharp(buffer);
        const metadata = await image.metadata();

        console.log("\n 图片基本信息:");
        console.log("- 尺寸:", `${metadata.width}x${metadata.height}`);
        console.log("- 格式:", metadata.format);
        console.log("- 颜色空间:", metadata.space);
        console.log("- 有 Alpha 通道:", metadata.hasAlpha);
        console.log("- EXIF 数据大小:", metadata.exif ? metadata.exif.length + " bytes" : "无");

        if (!metadata.exif) {
            console.log("\n 没有找到 EXIF 数据");
            console.log("   这可能是因为:");
            console.log("   1. 图片被处理过，EXIF 数据被移除");
            console.log("   2. 图片格式不支持 EXIF (如 PNG, GIF)");
            console.log("   3. 相机/设备没有写入 EXIF 数据");
            return;
        }

        // 使用 exif-reader 解析 EXIF 数据
        const exifData = exifReader(metadata.exif);

        if (!exifData) {
            console.log("\n EXIF 数据解析失败");
            return;
        }

        console.log("\n EXIF 数据解析成功");
        console.log("- 数据段:", Object.keys(exifData));

        // 显示图像信息 (IFD0)
        // @ts-ignore
        if (exifData.image) {
            console.log("\n 相机/图像信息:");
            // @ts-ignore
            const img = exifData.image;
            if (img.Make) console.log("  品牌:", img.Make);
            if (img.Model) console.log("  型号:", img.Model);
            if (img.Software) console.log("  软件:", img.Software);
            if (img.DateTime) console.log("  修改时间:", img.DateTime);
            if (img.ImageWidth && img.ImageHeight) {
                console.log("  图片尺寸:", `${img.ImageWidth}x${img.ImageHeight}`);
            }
            if (img.Orientation) {
                const orientations = {
                    1: "正常",
                    2: "水平翻转",
                    3: "180度旋转",
                    4: "垂直翻转",
                    5: "垂直翻转+90度顺时针旋转",
                    6: "90度顺时针旋转",
                    7: "水平翻转+90度顺时针旋转",
                    8: "90度逆时针旋转",
                };
                console.log("  方向:", orientations[img.Orientation] || img.Orientation);
            }
        }

        // 显示拍摄参数 (Exif IFD)
        // @ts-ignore
        if (exifData.exif) {
            console.log("\n 拍摄参数:");
            // @ts-ignore
            const exif = exifData.exif;
            if (exif.DateTimeOriginal) console.log("  拍摄时间:", exif.DateTimeOriginal);
            if (exif.ISO) console.log("  ISO:", exif.ISO);
            if (exif.FNumber) console.log("  光圈: f/" + exif.FNumber);
            if (exif.ExposureTime) {
                const speed = exif.ExposureTime < 1 ? `1/${Math.round(1 / exif.ExposureTime)}` : `${exif.ExposureTime}s`;
                console.log("  快门速度:", speed);
            }
            if (exif.FocalLength) console.log("  焦距:", exif.FocalLength + "mm");
            if (exif.Flash !== undefined) {
                console.log("  闪光灯:", exif.Flash > 0 ? "开启" : "关闭");
            }
            if (exif.WhiteBalance !== undefined) {
                console.log("  白平衡:", exif.WhiteBalance === 0 ? "自动" : "手动");
            }
            if (exif.ExposureMode !== undefined) {
                const modes = { 0: "自动", 1: "手动", 2: "自动包围" };
                console.log("  曝光模式:", modes[exif.ExposureMode] || exif.ExposureMode);
            }
        }

        // 显示 GPS 信息
        // @ts-ignore
        if (exifData.gps) {
            console.log("\n GPS 信息:");
            // @ts-ignore
            const gps = exifData.gps;

            // 处理纬度
            if (gps.GPSLatitude && gps.GPSLatitudeRef) {
                const lat = convertDMSToDD(gps.GPSLatitude, gps.GPSLatitudeRef);
                console.log("  纬度:", lat + "° (" + gps.GPSLatitudeRef + ")");
            }

            // 处理经度
            if (gps.GPSLongitude && gps.GPSLongitudeRef) {
                const lon = convertDMSToDD(gps.GPSLongitude, gps.GPSLongitudeRef);
                console.log("  经度:", lon + "° (" + gps.GPSLongitudeRef + ")");
            }

            if (gps.GPSAltitude) {
                console.log("  海拔:", gps.GPSAltitude + "m");
            }

            if (gps.GPSTimeStamp) {
                console.log("  GPS 时间:", gps.GPSTimeStamp);
            }

            if (gps.GPSDateStamp) {
                console.log("  GPS 日期:", gps.GPSDateStamp);
            }
        }

        // 显示缩略图信息
        // @ts-ignore
        if (exifData.thumbnail) {
            console.log("\n 缩略图信息: 存在");
        }
    } catch (error) {
        console.error(" 解析失败:", error.message);
    }
}

// DMS 转 DD 转换函数
function convertDMSToDD(dms, ref) {
    if (!Array.isArray(dms) || dms.length !== 3) {
        return null;
    }

    const degrees = dms[0];
    const minutes = dms[1];
    const seconds = dms[2];

    let dd = degrees + minutes / 60 + seconds / 3600;

    if (ref === "S" || ref === "W") {
        dd = dd * -1;
    }

    return Math.round(dd * 1000000) / 1000000; // 6位小数精度
}

// 命令行使用示例
if (process.argv.length > 2) {
    const imagePath = process.argv[2];
    testExifData(imagePath);
} else {
    console.log("使用方法: node test-exif.js <图片路径>");
    console.log("例如: node test-exif.js ./photo.jpg");
}

module.exports = testExifData;
