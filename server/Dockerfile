# 使用阿里云镜像源加速
FROM node:18-alpine

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