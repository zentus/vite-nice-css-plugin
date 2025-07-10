/// <reference types="vite" />

declare module '@zentus/vite-nice-css-plugin' {
    const plugin: () => import('vite').Plugin;
    export = plugin;
}