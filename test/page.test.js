import Page from '../templates/DruxtNodePreviewPage.vue'

// A fake page that has the component's methods, so the hooks can call them.
const withMethods = (page) => Object.assign(page, Page.methods)

// The page's own options, called the way Nuxt calls them.
const context = (layout, layoutName) => ({
  ...Page.methods,
  $druxtNodePreview: {
    layout: jest.fn((name) => (name === layout ? layout : undefined)),
    endpoint: () => null,
  },
  $route: { query: { layout } },
  $nuxt: {
    layoutName,
    loadLayout: jest.fn().mockResolvedValue(),
    // Nuxt sets the name at once, and a new name mounts a new page.
    setLayout: jest.fn(function (name) {
      this.layoutName = name
    }),
  },
})

describe('DruxtNodePreviewPage', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('the layout hook asks the plugin about ?layout=', () => {
    const preview = { layout: jest.fn(() => 'bare') }
    expect(
      Page.layout({
        $druxtNodePreview: preview,
        route: { query: { layout: 'bare' } },
      })
    ).toBe('bare')
    expect(preview.layout).toHaveBeenCalledWith('bare')
  })

  test('mounted sets a listed layout the static page did not have', async () => {
    const page = { ...context('bare', 'default'), error: null }
    await Page.mounted.call(page)
    expect(page.$nuxt.loadLayout).toHaveBeenCalledWith('bare')
    expect(page.$nuxt.setLayout).toHaveBeenCalledWith('bare')
  })

  test('mounted leaves a layout that is already set', async () => {
    const page = { ...context('bare', 'bare'), error: null }
    await Page.mounted.call(page)
    expect(page.$nuxt.setLayout).not.toHaveBeenCalled()
  })

  test('mounted loads nothing after it changes the layout', async () => {
    // A new layout mounts a new page, and that page loads the preview. So
    // this one must not fetch and seed the same document again.
    const page = { ...context('bare', 'default'), error: null }
    page.$druxtNodePreview.endpoint = () => '/jsonapi/node/page/uuid/preview'
    page.$druxtNodePreview.fetch = jest.fn().mockResolvedValue({ data: {} })
    await Page.mounted.call(page)
    expect(page.$nuxt.setLayout).toHaveBeenCalledWith('bare')
    expect(page.$druxtNodePreview.fetch).not.toHaveBeenCalled()
  })

  test('mounted loads the preview when Nuxt keeps the layout it had', async () => {
    // Nuxt falls back to the default layout for one the site does not have.
    const page = { ...context('bare', 'default'), error: null }
    page.$nuxt.setLayout = jest.fn()
    page.$druxtNodePreview.endpoint = () => '/jsonapi/node/page/uuid/preview'
    page.$druxtNodePreview.fetch = jest.fn().mockResolvedValue({ data: {} })
    page.$druxtNodePreview.seed = jest.fn(() => null)
    await Page.mounted.call(page)
    expect(page.$druxtNodePreview.fetch).toHaveBeenCalled()
  })

  test('mounted loads the preview when the layout fails to load', async () => {
    // A layout chunk can fail to download. The preview still shows.
    const page = { ...context('bare', 'default'), error: null }
    page.$nuxt.loadLayout = jest
      .fn()
      .mockRejectedValue(new Error('Loading chunk failed'))
    page.$druxtNodePreview.endpoint = () => '/jsonapi/node/page/uuid/preview'
    page.$druxtNodePreview.fetch = jest.fn().mockResolvedValue({ data: {} })
    page.$druxtNodePreview.seed = jest.fn(() => null)
    await Page.mounted.call(page)
    expect(page.$nuxt.setLayout).not.toHaveBeenCalled()
    expect(page.$druxtNodePreview.fetch).toHaveBeenCalled()
    expect(console.error).not.toHaveBeenCalled()
  })

  test('mounted logs a layout that fails for another reason', async () => {
    // A fault in the layout itself is not a download failure, so it shows in
    // the console. The preview still loads in the layout the page has.
    const page = { ...context('bare', 'default'), error: null }
    page.$nuxt.loadLayout = jest
      .fn()
      .mockRejectedValue(new TypeError('layout is broken'))
    page.$druxtNodePreview.endpoint = () => '/jsonapi/node/page/uuid/preview'
    page.$druxtNodePreview.fetch = jest.fn().mockResolvedValue({ data: {} })
    page.$druxtNodePreview.seed = jest.fn(() => null)
    await Page.mounted.call(page)
    expect(console.error).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(TypeError)
    )
    expect(page.$druxtNodePreview.fetch).toHaveBeenCalled()
  })

  // Nuxt 2 does not reject a layout chunk that fails to load. It calls its
  // own error() with a 500 and resolves, and then shows its error page.
  const failingNuxt = (page, message) => {
    page.$nuxt.nuxt = { err: null }
    page.$nuxt.error = jest.fn(function (err) {
      this.nuxt.err = err || null
    })
    page.$nuxt.loadLayout = jest.fn(function () {
      return Promise.resolve(this.error({ statusCode: 500, message }))
    })
    page.$druxtNodePreview.endpoint = () => '/jsonapi/node/page/uuid/preview'
    page.$druxtNodePreview.fetch = jest.fn().mockResolvedValue({ data: {} })
    page.$druxtNodePreview.seed = jest.fn(() => null)
  }

  test('mounted clears the error page Nuxt shows for a failed layout chunk', async () => {
    const page = { ...context('bare', 'default'), error: null }
    failingNuxt(page, 'Loading chunk 3 failed.')
    await Page.mounted.call(page)
    expect(page.$nuxt.nuxt.err).toBeNull()
    expect(page.$nuxt.setLayout).not.toHaveBeenCalled()
    expect(page.$druxtNodePreview.fetch).toHaveBeenCalled()
    expect(console.error).not.toHaveBeenCalled()
  })

  test('mounted logs a layout error Nuxt reports that is not a download', async () => {
    const page = { ...context('bare', 'default'), error: null }
    failingNuxt(page, 'layout is broken')
    await Page.mounted.call(page)
    expect(page.$nuxt.nuxt.err).toBeNull()
    expect(console.error).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ message: 'layout is broken' })
    )
    expect(page.$druxtNodePreview.fetch).toHaveBeenCalled()
  })

  test('mounted loads the preview when the layout is already set', async () => {
    const page = { ...context('bare', 'bare'), error: null }
    page.$druxtNodePreview.endpoint = () => '/jsonapi/node/page/uuid/preview'
    page.$druxtNodePreview.fetch = jest
      .fn()
      .mockResolvedValue({ data: { type: 'node--page', id: 'uuid' } })
    page.$druxtNodePreview.seed = jest.fn(() => ({
      type: 'node--page',
      id: 'uuid',
    }))
    await Page.mounted.call(page)
    expect(page.$druxtNodePreview.fetch).toHaveBeenCalledWith(
      '/jsonapi/node/page/uuid/preview'
    )
    expect(page.entity).toEqual({ type: 'node--page', id: 'uuid' })
  })

  test('mounted leaves the layout alone without a listed one', async () => {
    const page = { ...context(undefined, 'default'), error: null }
    await Page.mounted.call(page)
    expect(page.$nuxt.setLayout).not.toHaveBeenCalled()
  })

  test('mounted shows nothing when the editor leaves during the fetch', async () => {
    // seed() returns null once the editor is leaving, while this page is
    // still mounted. A document without an entity would not render.
    const page = withMethods({
      $druxtNodePreview: {
        layout: jest.fn(() => undefined),
        endpoint: () => '/jsonapi/node/page/uuid/preview',
        fetch: jest
          .fn()
          .mockResolvedValue({ data: { type: 'node--page', id: 'uuid' } }),
        seed: jest.fn(() => null),
      },
      $route: { query: {} },
      document: null,
      entity: null,
      error: null,
    })
    await Page.mounted.call(page)
    expect(page.$druxtNodePreview.seed).toHaveBeenCalled()
    expect(page.document).toBeNull()
    expect(page.entity).toBeNull()
    expect(page.error).toBeNull()
  })

  test('mounted seeds nothing once the page is gone', async () => {
    // The editor can leave this preview and open another before the first
    // fetch ends. The first document must not reach the second preview.
    let resolve
    const page = withMethods({
      $druxtNodePreview: {
        layout: jest.fn(() => undefined),
        endpoint: () => '/jsonapi/node/page/uuid/preview',
        fetch: jest.fn(
          () =>
            new Promise((done) => {
              resolve = done
            })
        ),
        seed: jest.fn(() => ({ type: 'node--page', id: 'uuid' })),
      },
      $route: { query: {} },
      document: null,
      entity: null,
      error: null,
    })
    const mounted = Page.mounted.call(page)
    Page.beforeDestroy.call(page)
    resolve({ data: { type: 'node--page', id: 'uuid' } })
    await mounted
    expect(page.$druxtNodePreview.seed).not.toHaveBeenCalled()
    expect(page.entity).toBeNull()
  })

  test('activated loads the preview again after the page was kept alive', async () => {
    // A site can keep pages alive. Leaving the preview flushes the seeded
    // resources, so a page that comes back must seed them again.
    const page = withMethods({
      $druxtNodePreview: {
        layout: jest.fn(() => undefined),
        endpoint: () => '/jsonapi/node/page/uuid/preview',
        fetch: jest
          .fn()
          .mockResolvedValue({ data: { type: 'node--page', id: 'uuid' } }),
        seed: jest.fn(() => ({ type: 'node--page', id: 'uuid' })),
      },
      $route: { query: {} },
      document: null,
      entity: null,
      error: null,
    })
    await Page.mounted.call(page)
    // Vue also calls activated after the first mount. That one loads nothing.
    await Page.activated.call(page)
    expect(page.$druxtNodePreview.fetch).toHaveBeenCalledTimes(1)

    Page.deactivated.call(page)
    await Page.activated.call(page)
    expect(page.$druxtNodePreview.fetch).toHaveBeenCalledTimes(2)
    expect(page.$druxtNodePreview.seed).toHaveBeenCalledTimes(2)
    expect(page.entity).toEqual({ type: 'node--page', id: 'uuid' })
  })

  test('a fetch that ends after the page is kept alive seeds nothing', async () => {
    let resolve
    const page = withMethods({
      $druxtNodePreview: {
        layout: jest.fn(() => undefined),
        endpoint: () => '/jsonapi/node/page/uuid/preview',
        fetch: jest.fn(
          () =>
            new Promise((done) => {
              resolve = done
            })
        ),
        seed: jest.fn(() => ({ type: 'node--page', id: 'uuid' })),
      },
      $route: { query: {} },
      document: null,
      entity: null,
      error: null,
    })
    const mounted = Page.mounted.call(page)
    Page.deactivated.call(page)
    resolve({ data: { type: 'node--page', id: 'uuid' } })
    await mounted
    expect(page.$druxtNodePreview.seed).not.toHaveBeenCalled()
    expect(page.entity).toBeNull()
  })

  test('a reload clears the error a failed load left', async () => {
    const page = withMethods({
      $druxtNodePreview: {
        layout: jest.fn(() => undefined),
        endpoint: () => '/jsonapi/node/page/uuid/preview',
        fetch: jest
          .fn()
          .mockRejectedValueOnce(new Error('HTTP 502'))
          .mockResolvedValue({ data: { type: 'node--page', id: 'uuid' } }),
        seed: jest.fn(() => ({ type: 'node--page', id: 'uuid' })),
      },
      $route: { query: {} },
      document: null,
      entity: null,
      error: null,
    })
    await Page.mounted.call(page)
    expect(page.error).toBe('HTTP 502')
    Page.deactivated.call(page)
    await Page.activated.call(page)
    expect(page.error).toBeNull()
    expect(page.entity).toEqual({ type: 'node--page', id: 'uuid' })
  })

  test('a reload shows nothing old while the new fetch runs', async () => {
    // Leaving flushed the seeded resources, so the old preview must not
    // render while the page loads it again.
    let resolve
    const page = withMethods({
      $druxtNodePreview: {
        layout: jest.fn(() => undefined),
        endpoint: () => '/jsonapi/node/page/uuid/preview',
        fetch: jest
          .fn()
          .mockResolvedValueOnce({ data: { type: 'node--page', id: 'uuid' } })
          .mockImplementation(
            () =>
              new Promise((done) => {
                resolve = done
              })
          ),
        seed: jest.fn(() => ({ type: 'node--page', id: 'uuid' })),
      },
      $route: { query: {} },
      document: null,
      entity: null,
      error: null,
    })
    await Page.mounted.call(page)
    expect(page.document).not.toBeNull()
    Page.deactivated.call(page)
    const reload = Page.activated.call(page)
    expect(page.document).toBeNull()
    expect(page.entity).toBeNull()
    resolve({ data: { type: 'node--page', id: 'uuid' } })
    await reload
    expect(page.entity).toEqual({ type: 'node--page', id: 'uuid' })
  })

  // The view mode comes from the query, which any link can set. A list, or a
  // name that is not a machine name, gives the default.
  test('viewMode takes only a machine name from ?vm=', () => {
    const viewMode = (vm) =>
      Page.computed.viewMode.call({ $route: { query: { vm } } })
    expect(viewMode('teaser')).toBe('teaser')
    expect(viewMode(undefined)).toBe('full')
    expect(viewMode(['teaser', 'full'])).toBe('full')
    expect(viewMode('teaser"><img src=x>')).toBe('full')
    expect(viewMode('')).toBe('full')
  })
})
