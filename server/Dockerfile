# 使用阿里云镜像源加速
# FROM node:18-alpine 改为使用阿里云公共镜像
FROM registry.cn-hangzhou.aliyuncs.com/library/node:18-alpine

# 如果阿里云镜像不可用，可以尝试其他源：
# FROM swr.cn-north-4.myhuaweicloud.com/library/node:18-alpine

# 配置 Alpine apk 国内源（阿里云）
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

WORKDIR /app

COPY package*.json ./

# 使用淘宝 npm 镜像源
RUN npm config set registry https://registry.npmmirror.com && \
    npm ci --only=production

COPY src ./src

RUN mkdir -p /data/notes

EXPOSE 3000

CMD ["node", "src/index.js"]