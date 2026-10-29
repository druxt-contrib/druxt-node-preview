<?php

/**
 * @file
 * The end to end suite's frontends, as Consumer Node Preview site targets.
 *
 * run.sh includes this file from settings.php. The ports come from the
 * environment, so a run on other ports needs no other change.
 */

$e2e_druxt = 'http://localhost:' . (getenv('FRONTEND_DRUXT_PORT') ?: '3111');
$e2e_static = 'http://localhost:' . (getenv('FRONTEND_STATIC_PORT') ?: '3112');
$settings['consumer_node_preview']['targets'] = [
  'druxt' => [
    'label' => 'E2E Druxt',
    'url' => $e2e_druxt . '/druxt/node/preview?vm=[view_mode]#[jsonapi_node_preview]',
  ],
  'static' => [
    'label' => 'E2E Static',
    'url' => $e2e_static . '/?vm=[view_mode]#[jsonapi_node_preview]',
  ],
];
