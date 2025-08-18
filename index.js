// Filename - index.js

// Requiring module
const process = require('process')

// An example displaying the respective memory
// usages in megabytes(MB)
for (const [key,value] of Object.entries(process.memoryUsage())){
    console.log(`Memory usage by ${key}, ${value/1000000}MB `)
}