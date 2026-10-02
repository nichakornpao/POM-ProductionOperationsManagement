const express = require('express');
const router = require('./src/routes/PurchaseHistory.route.js');
console.log('router is', typeof router);
if (router && router.stack) {
  const stack = router.stack.filter(layer => layer.route).map(layer => ({ path: layer.route.path, methods: Object.keys(layer.route.methods) }));
  console.log(JSON.stringify(stack, null, 2));
} else {
  console.log('No router stack available.');
}
