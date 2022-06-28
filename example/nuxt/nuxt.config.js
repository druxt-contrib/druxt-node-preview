const baseUrl = process.env.GITPOD_WORKSPACE_ID
  ? `https://8080-${process.env.GITPOD_WORKSPACE_ID}.${process.env.GITPOD_WORKSPACE_CLUSTER_HOST}`
  : 'http://druxt-node-preview.ddev.site'

export default {
  buildModules: [
    '@druxt-contrib/node-preview',
    'druxt-entity'
  ],
  druxt: { baseUrl }
}
