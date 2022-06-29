import chalk from 'chalk'
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
      path: '/preview/node/:bundle/:mode',
      component: resolve(this.options.buildDir, 'components/druxt-node-preview.vue'),
      chunkName: 'druxt-node-preview'
    })
  })

  // Add CLI badge.
  this.options.cli.badgeMessages.push(`${chalk.bold('Node preview:')} ${chalk.blue.underline('/preview/node/[bundle]/[mode]#[url]')}`)
}

export default NuxtModule
