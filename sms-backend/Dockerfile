FROM node:22-alpine
WORKDIR /app
COPY package.json server.js ./
COPY public ./public
COPY scripts ./scripts
ENV NODE_ENV=production
# No USER/VOLUME directives on purpose: Railway mounts its volume as root and manages volumes itself.
# (On a plain VPS you may prefer to add `USER node` and chown your data volume.)
EXPOSE 3000
CMD ["node", "server.js"]
