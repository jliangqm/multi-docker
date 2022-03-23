const keys = require('./keys');

// Express
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// PG
const { Pool } = require('pg');
const pgClient = new Pool({
  user: keys.pgUser,
  host: keys.pgHost,
  database: keys.pgDatabase,
  password: keys.pgPassword,
  port: keys.pgPort
});
pgClient.on('error', () => console.log('Lost PG connection'));
pgClient.on("connect", (client) => {
  client
    .query("CREATE TABLE IF NOT EXISTS values (number INT)")
    .catch((err) => console.error(err));
});

// Redis
const redis = require('redis');
(async () => {
  const redisClient = redis.createClient({
    socket: {
      host: keys.redisHost,
      port: keys.redisPort,
      reconnectStrategy: () => 1000
    }
  });

  redisClient.on('error', (err) => console.log('Redis Client Error', err));

  await redisClient.connect();
  const redisPublisher = redisClient.duplicate();
  await redisPublisher.connect();
  // Express Route
  app.get('/', (_, res) => {
    res.send('Hi');
  });

  app.get('/values/all', async (_, res) => {
    const values = await pgClient.query('SELECT * from values');

    res.send(values.rows);
  });

  app.get('/values/current', async (_, res) => {
    const values = await redisClient.hGetAll('values');
    res.send(values);
  });

  app.post('/values', async (req, res) => {
    const index = req.body.index;

    if (parseInt(index) > 40) {
      return res.status(422).send('Index too high');
    }

    await redisClient.hSet('values', index, 'Nothing yes!');
    redisPublisher.publish('insert', index);
    pgClient.query('INSERT INTO values(number) VALUES($1)', [index]);

    res.send({ working: true });
  });

  app.listen(5000, err => console.log('Listening'));
})();