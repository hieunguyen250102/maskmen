import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  /**
   * Source files import each other with explicit `.js` specifiers, which is
   * what Node's ESM loader wants for the custom server. Webpack resolves those
   * back to the TypeScript sources they actually mean, so one set of imports
   * works for both the server and the browser bundle.
   */
  webpack(config) {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
      '.jsx': ['.tsx', '.jsx'],
    };
    return config;
  },
};

export default nextConfig;
