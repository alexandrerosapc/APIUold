import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";
import joi from "joi";
import dayjs from "dayjs";

dotenv.config();

const mongoClient = new MongoClient(process.env.DATABASE_URL);

const server = express();

server.use(express.json());
server.use(cors());

server.use((req, res, next) => {
  res.setHeader('Content-Type', 'application/json; charset=UTF-8');
  req.headers['accept-charset'] = 'utf-8'; // Adiciona o charset ao header de requisição
  next();
});

let db;
const CHECK_INTERVAL = 15000; // 15 segundos
const TIMEOUT_THRESHOLD = 10000; // 10 segundos

async function startServer() {
  try {
    await mongoClient.connect();
    db = mongoClient.db();
    console.log("Conectado ao banco de dados");
  } catch (error) {
    console.log("Erro ao conectar ao banco de dados:", error);
  }

  server.listen(process.env.PORT, () => {
    console.log(`Servidor funcionando na porta ${process.env.PORT}`);
  });

  setInterval(removeInactiveParticipants, CHECK_INTERVAL);
}

async function removeInactiveParticipants() {
  const now = Date.now();
  const threshold = now - TIMEOUT_THRESHOLD;

  try {
    // Encontrar participantes inativos (lastStatus mais antigo que o threshold)
    const inactiveParticipants = await db
      .collection("participantes")
      .find({ lastStatus: { $lt: threshold } })
      .toArray();

    if (inactiveParticipants.length > 0) {
      // Remover os participantes inativos
      const inactiveParticipantNames = inactiveParticipants.map(p => p.name);

      await db.collection("participantes").deleteMany({
        name: { $in: inactiveParticipantNames }
      });

      // Inserir uma mensagem para cada participante removido
      const exitMessages = inactiveParticipants.map(p => ({
        from: p.name,
        to: "Todos",
        text: "sai da sala...",
        type: "status",
        time: dayjs().format("HH:mm:ss")
      }));

      await db.collection("messages").insertMany(exitMessages);

      console.log(`${inactiveParticipants.length} participante(s) removido(s):`, inactiveParticipantNames);
    }
  } catch (error) {
    console.log("Erro ao remover participantes inativos:", error);
  }
}

server.post("/participants", async (req, res) => {
  const participante = req.body;

  const participanteSchema = joi.object({
    name: joi.string().required(),
  });

  const validation = participanteSchema.validate(participante);

  if (validation.error) {
    const erros = validation.error.details.map((err) => err.message);
    return res.status(422).send(erros);
  }

  try {
    const participanteExiste = await db.collection("participantes").findOne({ name: participante.name });

    if (participanteExiste) return res.status(409).send("Este usuário já existe!");

    const participanteComStatus = {
      name: participante.name,
      lastStatus: Date.now() // utilize o timestamp atual
    };

    await db.collection("participantes").insertOne(participanteComStatus);

    const message = {
      from: participante.name,
      to: 'Todos',
      text: 'entra na sala...',
      type: 'status',
      time: dayjs().format('HH:mm:ss') // Aqui o tempo formatado
    };

    await db.collection("messages").insertOne(message);

    res.sendStatus(201);
  } catch (error) {
    console.log("Erro ao inserir participante e/ou mensagem:", error);
    res.status(500).send("Erro no servidor");
  }
});

server.get("/participants", async (req, res) => {
  try {
    const dados = await db.collection("participantes").find().toArray();
    console.log(dados);

    return res.send(dados);
  } catch (error) {
    res.status(500).send("Deu erro no servidor de banco de dados");
  }
});

server.post("/messages", async (req, res) => {
  const message = req.body;
  const { user } = req.headers;

  const messageSchema = joi.object({
    to: joi.string().required(),
    text: joi.string().required(),
    type: joi.string().valid("message", "private_message").required(),
  });

  const validation = messageSchema.validate(message);

  if (validation.error) {
    const erros = validation.error.details.map((err) => err.message);
    return res.status(422).send(erros);
  }

  try {
    const participanteExiste = await db.collection("participantes").findOne({ name: user });

    if (!participanteExiste) {
      return res.status(422).send("Usuário não faz parte do grupo");
    }

    const time = dayjs().format("HH:mm:ss");

    const novaMensagem = {
      ...message,
      from: user,
      time,
    };

    await db.collection("messages").insertOne(novaMensagem);
    res.sendStatus(201);
  } catch (error) {
    console.log("Erro ao inserir mensagem:", error);
    res.status(500).send("Erro no servidor");
  }
});

server.get("/messages", async (req, res) => {
  const { limit } = req.query;
  const user = req.headers.user; 

  try {
    const filtro = {
      $or: [
        { type: "status" },
        { from: user },
        { to: user },
        { to: 'Todos' }
      ]
    };

    let mensagens;

    if (!limit) {
      mensagens = await db.collection("messages").find(filtro).sort({ _id: -1 }).toArray();
    } else {
      const limitNum = parseInt(limit);
      mensagens = await db.collection("messages").find(filtro).sort({ _id: -1 }).limit(limitNum).toArray();
    }

    return res.send(mensagens);
  } catch (error) {
    res.status(500).send("Erro no servidor");
  }
});

server.post("/status", async (req, res) => {
  const { user } = req.headers;

  try {
    const usuarioExistente = await db.collection("participantes").findOne({ name: user });

    if (!usuarioExistente) {
      return res.sendStatus(404);
    }

    await db.collection("participantes").updateOne(
      { name: user },
      { $set: { lastStatus: Date.now() } }
    );

    return res.sendStatus(200);
  } catch (error) {
    res.status(500).send("Erro no servidor");
  }
});

startServer();
