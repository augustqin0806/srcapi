const axios = require("axios");

/**
 * 判断坐标是否在中国大陆
 */
function isInChina(lat, lon) {
    return lat >= 18 && lat <= 54 && lon >= 73 && lon <= 135;
}

/**
 * 国内高德地图反向地理编码
 * @param {number} lat
 * @param {number} lon
 * @param {string} apiKey 高德地图 Key
 */
async function geocodeChina(lat, lon, apiKey) {
    const url = "https://restapi.amap.com/v3/geocode/regeo";
    const params = {
        key: apiKey,
        location: `${lon},${lat}`,
        extensions: "all",
        output: "JSON",
    };
    const res = await axios.get(url, { params, timeout: 15000 });

    if (res.data && res.data.status === "1" && res.data.regeocode) {
        console.log("高德返回", res.data);
        const addr = res.data.regeocode.addressComponent;
        return {
            country: addr.country || null,
            province: addr.province,
            city: addr.city || addr.province,
            district: addr.district,
            street: addr.township,
            formattedAddress: res.data.regeocode.formatted_address,
        };
    }
    throw new Error("国内地理编码失败");
}
/**
 * 高德反向地理编码
 * @param {number} lat 纬度（WGS84 或 GCJ-02 均可，高德自动识别）
 * @param {number} lon 经度
 * @returns {Promise<{city:string,country:string,displayName:string}>}
 */
async function revGeo(lat, lon, apiKey) {
    const key = apiKey;
    const url = "https://restapi.amap.com/v3/geocode/regeo";
    const params = {
        key,
        location: `${lon},${lat}`, // 高德要求「经度,纬度」
        extensions: "all", // 返回详细地址 + 周边 POI
        radius: 1000, // 搜索半径（米）
        output: "JSON",
    };

    try {
        const { data } = await axios.get(url, { params, timeout: 10000 });
        if (data.status === "1" && data.regeocode) {
            const a = data.regeocode.addressComponent;
            return {
                displayName: data.regeocode.formatted_address,
                // @ts-ignore
                address: {
                    city: a.city || a.town || a.district || null,
                    country: a.country || null,
                    province: a.province || null,
                    district: a.district || null,
                    street: a.street?.name || null,
                    streetNumber: a.streetNumber?.number || null,
                },
                // 周边 1000 米内兴趣点
                pois: data.regeocode.pois?.slice(0, 3).map((p) => p.name) || [],
            };
        }
        throw new Error(data.info || "反向地理编码失败");
    } catch (e) {
        console.warn("[RevGeo] 请求异常", e.message);
        return null;
    }
}
/**
 * 国外 Nominatim 反向地理编码---------一直没成功 没找到原因
 */
async function geocodeInternational(lat, lon) {
    const url = "https://nominatim.openstreetmap.org/reverse";
    const params = { lat, lon, format: "json", zoom: 14, addressdetails: 1 };
    const res = await axios.get(url, { params, timeout: 15000 });
    if (res.data && res.data.address) {
        const addr = res.data.address;
        return {
            country: addr.country || "",
            province: addr.state || "",
            city: addr.city || addr.town || addr.village || "",
            district: addr.county || "",
            street: addr.road || "",
            formattedAddress: res.data.display_name,
        };
    }
    throw new Error("国外地理编码失败");
}

/**
 * 国外 Google Maps 反向地理编码
 */
async function reverseGeocodeGoogle(lat, lon, apiKey) {
    if (!apiKey) {
        throw new Error("缺少 GOOGLE_API_KEY，请设置环境变量");
    }

    const url = "https://maps.googleapis.com/maps/api/geocode/json";
    const params = {
        latlng: `${lat},${lon}`,
        key: apiKey,
        language: "en", // 可以改成 "zh-CN" 显示中文
    };

    const res = await axios.get(url, { params, timeout: 15000 });

    if (res.data.status === "OK" && res.data.results.length > 0) {
        const result = res.data.results[0];
        const addressComponents = result.address_components;

        // 辅助函数：按类型取值
        const getComponent = (type) => {
            const comp = addressComponents.find((c) => c.types.includes(type));
            return comp ? comp.long_name : "";
        };

        return {
            country: getComponent("country"),
            province: getComponent("administrative_area_level_1"),
            city: getComponent("locality") || getComponent("administrative_area_level_2"),
            district: getComponent("sublocality") || "",
            street: getComponent("route"),
            formattedAddress: result.formatted_address,
        };
    }

    throw new Error("Google 地理编码失败: " + res.data.status);
}

/**
 * 单条坐标解析（自动选择国内/国外）
 */
async function reverseGeocode(lat, lon, options = {}) {
    const { retries = 3, retryDelay = 2000 } = options;
    const amapKey = process.env.GAODE_API_KEY;
    const googleKey = process.env.GOOGLE_API_KEY;
    if (!amapKey) throw new Error("国内坐标解析需要提供高德地图 Key");

    let attempt = 0;
    while (attempt < retries) {
        try {
            if (isInChina(lat, lon)) {
                return await geocodeChina(lat, lon, amapKey);
            } else {
                return await reverseGeocodeGoogle(lat, lon, googleKey);
                // return await geocodeInternational(lat, lon);
            }
        } catch (err) {
            attempt++;
            if (attempt >= retries) throw err;
            await new Promise((res) => setTimeout(res, retryDelay));
        }
    }
}

/**
 * 批量坐标解析-------暂时用不上
 * @param {Array} coords [{lat, lon}, ...]
 * @param {object} options 参数同 reverseGeocode + delay(ms) 控制批量间隔
 */
async function reverseGeocodeBatch(coords, options = {}) {
    const results = [];
    for (const { lat, lon } of coords) {
        try {
            const res = await reverseGeocode(lat, lon, options);
            results.push(res);
            // 延迟避免接口限流
            await new Promise((r) => setTimeout(r, options.delay || 1500));
        } catch (err) {
            results.push({ error: err.message, lat, lon });
        }
    }
    return results;
}

module.exports = { reverseGeocode, reverseGeocodeBatch };
