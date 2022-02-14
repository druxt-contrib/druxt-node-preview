import 'regenerator-runtime/runtime'
import { createLocalVue, mount } from '@vue/test-utils'

// import DruxtWrapper from 'druxt/dist/components/DruxtWrapper.vue'
import Component from '../../templates/component.vue'

// Setup local vue instance.
const localVue = createLocalVue()
// localVue.component('DruxtWrapper', DruxtWrapper)

// Mount the Vue component.
const mountComponent = function(options = {}) {
  return mount(
    Component,
    {
      localVue,
      ...options,
      mocks: {
        $fetchState: { pending: true },
        $route: {
          hash: undefined,
        },
        ...(options || {}).mocks
      },
    }
  )
}

describe('Component', () => {
  test('Test Node', async () => {
    // Setup mock get function.
    const getFn = jest.fn(() => ({
      data: {
        data: {
          id: 'test',
          type: 'node--page',
          attributes: {},
        }
      }
    }))

    // Mount the component.
    const wrapper = mountComponent({
      mocks: {
        $druxt: { axios: { get: getFn }},
        $route: {
          hash: '#https:/demo-api.druxtjs.org/jsonapi/node/page/UUID/preview',
          params: {
            view_mode: 'full'
          }
        }
      }
    })

    // Simulate the Nuxt fetch hook.
    await wrapper.vm.$options.fetch.call(wrapper.vm)

    // Assert Druxt requested the required data.
    expect(getFn).toHaveBeenCalledWith(
      'https://demo-api.druxtjs.org/jsonapi/node/page/UUID/preview',
      { withCredentials: true }
    )

    // Assert data and props are as expected.
    expect(wrapper.vm.entity).toStrictEqual({
      attributes: {},
      id: 'test',
      type: 'node--page'
    })
    expect(wrapper.vm.props).toStrictEqual({
      mode: 'full',
      type: 'node--page'
    })
  })

  test('No data', async () => {
    // Mount the component.
    const wrapper = mountComponent()

    // Simulate the Nuxt fetch hook.
    await wrapper.vm.$options.fetch.call(wrapper.vm)

    // Assert data and props are as expected.
    expect(wrapper.vm.entity).toStrictEqual({})
    expect(wrapper.vm.props).toStrictEqual(undefined)
    expect(wrapper.vm.response).toStrictEqual(undefined)

    expect(wrapper.html()).toMatchSnapshot()
  })
})
