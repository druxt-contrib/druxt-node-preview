import { resolve } from 'path'

// eslint-disable-next-line no-unused-vars
const NuxtModule = function (moduleOptions = {}) {
  // Add the DruxtEntity module.
  this.addModule('druxt-entity')

  // Add Node Preview component.
  this.addTemplate({
    src: resolve(__dirname, '../templates/component.vue'),
    fileName: 'components/druxt-node-preview.vue',
    options: {}
  })

  // Add Node Preview route.
  this.extendRoutes((routes, resolve) => {
    routes.push({
      name: 'druxt-node-preview',
      // @TODO - Make path configurable.
      path: '/node/preview/:view_mode',
      component: resolve(this.options.buildDir, 'components/druxt-node-preview.vue'),
      chunkName: 'druxt-node-preview'
    })
  })
}

export default NuxtModule
