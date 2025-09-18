const p = require('@strapi/provider-upload-local');
console.log('实际导出:', p);
// @ts-ignore
console.log('存在 init?', typeof p.init);