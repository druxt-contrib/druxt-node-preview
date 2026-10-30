<?php

/**
 * @file
 * The end to end suite's frontends, as Consumer Node Preview site targets,
 * and Simple OAuth's keys.
 *
 * run.sh includes this file from settings.php. The ports and the key folder
 * come from the environment, so a run on other ports needs no other change.
 */

$e2e_druxt = 'http://localhost:' . (getenv('FRONTEND_DRUXT_PORT') ?: '3111');
$e2e_static = 'http://localhost:' . (getenv('FRONTEND_STATIC_PORT') ?: '3112');
$settings['consumer_node_preview']['targets'] = [
  'druxt' => [
    'label' => 'E2E Druxt',
    'url' => $e2e_druxt . '/druxt/node/preview?vm=[view_mode]&layout=[layout]#[jsonapi_node_preview]',
    // The Druxt frontend's layouts. The first is the one a preview opens in.
    'layouts' => ['default', 'preview'],
  ],
  'static' => [
    'label' => 'E2E Static',
    'url' => $e2e_static . '/?vm=[view_mode]#[jsonapi_node_preview]',
  ],
];

// Simple OAuth's keys. run.sh makes a new pair for each run, outside the
// repository.
if ($e2e_oauth_keys = getenv('E2E_OAUTH_KEYS')) {
  $config['simple_oauth.settings']['public_key'] = $e2e_oauth_keys . '/public.key';
  $config['simple_oauth.settings']['private_key'] = $e2e_oauth_keys . '/private.key';
}
