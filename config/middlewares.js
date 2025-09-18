module.exports = [
  'strapi::logger',
  'strapi::errors',
  'strapi::security',
  'strapi::cors',
  'strapi::poweredBy',
  'strapi::query',
  'strapi::body',
  'strapi::session',
  'strapi::favicon',
  'strapi::public',

   // 添加上传处理中间件（在 body 解析之后）
  {
    name: 'global::upload-handler',
    config: {},
  },
];
