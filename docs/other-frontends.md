# Writing another frontend

[Consumer Node Preview's target
URLs](https://git.drupalcode.org/project/consumer_node_preview/-/blob/1.0.x/README.md#target-urls)
show how a frontend reads the preview address from the URL, including the
`https:/` repair that some routers need. Before it renders anything, a
frontend should make the same checks as this module. See [The preview
request](preview-request.md).

This module reads `[view_mode]` and `[layout]` from the `vm` and `layout`
query parameters. They change only how the preview looks. The JSON:API
document is the same for each.
