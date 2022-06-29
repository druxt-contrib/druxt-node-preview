<template>
  <div class="druxt-node-preview">
    <ClientOnly v-if="!$fetchState.pending">
      <DruxtEntity
        v-if="entity"
        v-model="entity"
        v-bind="props"
      />

      <DruxtDebug
        v-else
        summary="An error has occured while access the preview data from your Drupal backend."
      >
        Copy and paste the raw preview JSON from <a
          :href="url"
          target="_blank"
          v-text="url"
        /> below to continue:
        <textarea v-model="model" />
      </DruxtDebug>
    </ClientOnly>
  </div>
</template>

<script>
import DruxtEntity from 'druxt-entity/dist/components/DruxtEntity.vue'
import DruxtModule from 'druxt/dist/components/DruxtModule.vue'

export default {
  data: () => ({
    entity: false,
    response: null,
    model: undefined,
  }),

  // Only fetch on client side so that the client session is used.
  fetchOnServer: false,

  // Fetch the JSON:API Node Preview data.
  async fetch() {
    // Get node theme component.
    const nodePreview = {
      $options: {
        components: this.$options.components,
        druxt: {
          componentOptions: DruxtEntity.druxt.componentOptions
        },
        name: 'DruxtEntity',
      },
      mode: this.mode,
      type: ['node', this.bundle].join('--'),
    }
    const options = DruxtModule.methods.getModuleComponents.call(nodePreview)
    // @TODO - use theme component to determine alter the JSON:API query.
    // eslint-disable-next-line
    const component = (((options.filter(o => o.global) || [])[0] || {}).name || 'DruxtWrapper')

    try {
      const { data } = await this.$druxt.axios.get(
        this.url,
        { withCredentials: true }
      )
      this.entity = (data || {}).data
      this.response = data
    } catch(err) {
      this.response = err.response
    }
  },

  computed: {
    /**
     * The Preview Node bundle.
     *
     * @type {string}
     */
    bundle: ({ $route }) => ($route.params || {}).bundle,

    /**
     * The Preview Node view mode.
     *
     * @type {string}
     */
    mode: ({ $route }) => ($route.params || {}).mode,

    /**
     * The DruxtEntity props.
     *
     * @type {object}
     */
    props: ({ bundle, mode }) => ({
      mode,
      type: ['node', bundle].join('--')
    }),

    /**
     * The JSON:API Node Preview data URL.
     */
    url: ({ $route }) => ($route.hash || '').substring(1).replace(':/', '://')
  },

  watch: {
    model() {
      try {
        const data = JSON.parse(this.model)
        this.entity = (data || {}).data
        this.response = data
      } catch(err) {
        console.error('Invalid JSON:API Node Preview data detected.')
      }
    }
  }
}
</script>

<style scoped>
textarea {
  display: block !important;
  height: 50vh;
  width: 100%;
}
</style>
