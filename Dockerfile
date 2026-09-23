FROM nginx:1.27-alpine
# copy config + site vào image — không phụ thuộc bind-mount
COPY nginxconf/default.conf /etc/nginx/conf.d/default.conf
COPY public/ /usr/share/nginx/html/
