import {clientsClaim as workbox_core_clientsClaim} from 'C:/Dev/eleco-react/node_modules/workbox-core/clientsClaim.mjs';
import {precacheAndRoute as workbox_precaching_precacheAndRoute} from 'C:/Dev/eleco-react/node_modules/workbox-precaching/precacheAndRoute.mjs';
import {cleanupOutdatedCaches as workbox_precaching_cleanupOutdatedCaches} from 'C:/Dev/eleco-react/node_modules/workbox-precaching/cleanupOutdatedCaches.mjs';
import {registerRoute as workbox_routing_registerRoute} from 'C:/Dev/eleco-react/node_modules/workbox-routing/registerRoute.mjs';
import {NavigationRoute as workbox_routing_NavigationRoute} from 'C:/Dev/eleco-react/node_modules/workbox-routing/NavigationRoute.mjs';
import {createHandlerBoundToURL as workbox_precaching_createHandlerBoundToURL} from 'C:/Dev/eleco-react/node_modules/workbox-precaching/createHandlerBoundToURL.mjs';/**
 * Welcome to your Workbox-powered service worker!
 *
 * You'll need to register this file in your web app.
 * See https://goo.gl/nhQhGp
 *
 * The rest of the code is auto-generated. Please don't update this file
 * directly; instead, make changes to your Workbox build configuration
 * and re-run your build process.
 * See https://goo.gl/2aRDsh
 */








self.skipWaiting();

workbox_core_clientsClaim();


/**
 * The precacheAndRoute() method efficiently caches and responds to
 * requests for URLs in the manifest.
 * See https://goo.gl/S9QRab
 */
workbox_precaching_precacheAndRoute([
  {
    "url": "registerSW.js",
    "revision": "1872c500de691dce40960bb85481de07"
  },
  {
    "url": "logo.png",
    "revision": "a6e04f1f6e526376c45dfef6d0c63f2e"
  },
  {
    "url": "index.html",
    "revision": "250fc6e33642cc9ecfb433071464f0b2"
  },
  {
    "url": "assets/purify.es-BgtpMKW3.js",
    "revision": null
  },
  {
    "url": "assets/index.es-B77EHrpt.js",
    "revision": null
  },
  {
    "url": "assets/index-Dx08whUi.js",
    "revision": null
  },
  {
    "url": "assets/index-BdmdKcPt.css",
    "revision": null
  },
  {
    "url": "assets/html2canvas.esm-QH1iLAAe.js",
    "revision": null
  },
  {
    "url": "logo.png",
    "revision": "a6e04f1f6e526376c45dfef6d0c63f2e"
  },
  {
    "url": "manifest.webmanifest",
    "revision": "b46b59553168cf9c07c5b79cd7156e10"
  }
], {});
workbox_precaching_cleanupOutdatedCaches();
workbox_routing_registerRoute(new workbox_routing_NavigationRoute(workbox_precaching_createHandlerBoundToURL("index.html")));






