#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import streamJson from 'stream-json';
import StreamArray from 'stream-json/streamers/StreamArray.js';

const { parser } = streamJson;
const streamArray = StreamArray;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Campos que são usados nos endpoints stats.ts e sales.ts
function sanitizeOrder(order) {
  const sanitized = {};

  // Campos diretos do order
  if (order.id !== undefined) sanitized.id = order.id;
  if (order.code !== undefined) sanitized.code = order.code;
  if (order.createdAt !== undefined) sanitized.createdAt = order.createdAt;
  if (order.status !== undefined) sanitized.status = order.status;
  if (order.totalPrice !== undefined) sanitized.totalPrice = order.totalPrice;

  // Campo customer (apenas phone e name)
  if (order.customer) {
    sanitized.customer = {};
    if (order.customer.phone !== undefined) sanitized.customer.phone = order.customer.phone;
    if (order.customer.name !== undefined) sanitized.customer.name = order.customer.name;
  }

  return sanitized;
}

async function main() {
  const inputPath = path.join(__dirname, '../tmp/Hackathon 2025-11-09/orders.json');
  const outputPath = path.join(__dirname, '../tmp/Hackathon 2025-11-09/orders-2.json');

  console.log('Sanitizando orders.json usando streaming...');
  console.log(`Arquivo de entrada: ${inputPath}`);
  console.log(`Arquivo de saída: ${outputPath}`);

  // Obtém o tamanho do arquivo original
  const stats = await fs.promises.stat(inputPath);
  const fileSize = stats.size;
  const fileSizeMB = (fileSize / 1024 / 1024).toFixed(2);
  console.log(`Tamanho original: ${fileSizeMB} MB\n`);

  const sanitizedOrders = [];
  let processedCount = 0;

  // Cria o pipeline de streaming com tratamento de erros
  const readStream = fs.createReadStream(inputPath, { encoding: 'utf8', highWaterMark: 64 * 1024 });
  const jsonParser = parser({ jsonStreaming: true });
  const arrayStream = new streamArray();

  // Conecta os streams
  readStream.pipe(jsonParser);
  jsonParser.pipe(arrayStream);

  // Processa cada item do array
  arrayStream.on('data', (chunk) => {
    try {
      const order = chunk.value;
      const sanitized = sanitizeOrder(order);
      sanitizedOrders.push(sanitized);
      processedCount++;

      if (processedCount % 1000 === 0) {
        process.stdout.write(`\rProcessando: ${processedCount} pedidos...`);
      }
    } catch (error) {
      console.error(`\nErro ao processar pedido ${processedCount}:`, error.message);
    }
  });

  // Aguarda o fim do stream
  await new Promise((resolve, reject) => {
    let errorOccurred = false;

    const handleError = (error) => {
      if (!errorOccurred) {
        errorOccurred = true;
        console.error(`\nErro no stream após processar ${processedCount} pedidos:`, error.message);
        // Continua mesmo com erro, salvando o que foi processado
        resolve();
      }
    };

    arrayStream.on('end', () => {
      if (!errorOccurred) resolve();
    });
    arrayStream.on('error', handleError);
    jsonParser.on('error', handleError);
    readStream.on('error', handleError);
  });

  console.log(`\nTotal processado: ${processedCount} pedidos`);
  console.log('Salvando arquivo...');

  // Salva o arquivo sanitizado
  await fs.promises.writeFile(
    outputPath,
    JSON.stringify(sanitizedOrders, null, 2),
    'utf-8'
  );

  // Calcula estatísticas
  const newStats = await fs.promises.stat(outputPath);
  const newSize = newStats.size;
  const newSizeMB = (newSize / 1024 / 1024).toFixed(2);
  const reduction = ((1 - newSize / fileSize) * 100).toFixed(2);

  console.log('\n✅ Concluído!');
  console.log(`Tamanho original: ${fileSizeMB} MB`);
  console.log(`Tamanho novo: ${newSizeMB} MB`);
  console.log(`Redução: ${reduction}%`);
}

main().catch(console.error);

