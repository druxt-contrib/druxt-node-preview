import DruxtNodePreview from '../templates/DruxtNodePreview.vue'

const document = {
  data: { type: 'node--doc_page', id: 'abc', attributes: { title: 'Unsaved' } },
  included: [],
}

describe('DruxtNodePreview component', () => {
  test('is a Druxt module named for its wrappers', () => {
    expect(DruxtNodePreview.name).toBe('DruxtNodePreview')
    expect(typeof DruxtNodePreview.extends.fetch).toBe('function')
  })

  test('wrapper options follow the bundle and view mode', () => {
    const options = DruxtNodePreview.druxt.componentOptions({ bundle: 'doc_page', mode: 'full' })
    expect(options).toEqual([['doc_page', 'full'], ['default']])
  })

  test('the bundle and entity come from the document', () => {
    const { entity, bundle } = DruxtNodePreview.computed
    const resource = entity({ document })
    expect(resource.id).toBe('abc')
    expect(bundle({ entity: resource })).toBe('doc_page')
  })

  test('wrappers get the document, entity and route props', () => {
    const props = DruxtNodePreview.druxt.propsData({ document, entity: document.data, mode: 'teaser' })
    expect(props).toEqual({ document, entity: document.data, mode: 'teaser', type: 'node--doc_page', uuid: 'abc' })
  })

  test('the default slot renders DruxtEntity for the node', () => {
    const h = jest.fn((tag, data) => ({ tag, data }))
    const slots = DruxtNodePreview.druxt.slots.call({ entity: document.data, mode: 'full' }, h)
    expect(slots.default()).toEqual({
      tag: 'DruxtEntity',
      data: { key: 'abc', props: { mode: 'full', type: 'node--doc_page', uuid: 'abc' } },
    })
  })
})
