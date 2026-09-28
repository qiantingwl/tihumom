FROM mcr.microsoft.com/playwright:v1.63.0-noble AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_PUBLIC_ORIGIN=https://www.tihu.mom
ENV VITE_PUBLIC_ORIGIN=$VITE_PUBLIC_ORIGIN
RUN npm run build

FROM mcr.microsoft.com/playwright:v1.63.0-noble
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8988
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY server ./server
COPY src/services/catalog.ts ./src/services/catalog.ts
COPY scripts/setup.mjs scripts/check-renderer.mjs scripts/build-icons.mjs ./scripts/
RUN mkdir -p /app/data && chown -R pwuser:pwuser /app
USER pwuser
EXPOSE 8988
CMD ["node","--import","tsx","server/index.ts"]
