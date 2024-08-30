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

    const lastStatus = Date.now();

    const participanteComStatus = {
      name: participante.name,
      lastStatus // utilize o timestamp original
    };

    await db.collection("participantes").insertOne(participanteComStatus);

    const message = {
      from: participante.name,
      to: 'Todos',
      text: 'entra na sala...',
      type: 'status',
      time: dayjs(lastStatus).format('HH:mm:ss') // Aqui o tempo formatado
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
  const { from } = req.headers;

  console.log(from)

  const messageSchema = joi.object({
    to: joi.string().required(),
    text: joi.string().required(),
    type: joi.string().valid("message", "private_message").required(),
  });

  // Validação do objeto message diretamente
  const validation = messageSchema.validate(message);

  if (validation.error) {
    const erros = validation.error.details.map((err) => err.message);
    return res.status(422).send(erros);
  }

  try {
    const participanteExiste = await db.collection("participantes").findOne({ name: from });

    if (!participanteExiste) {
      return res.status(422).send("Usuário não faz parte do grupo");
    }

    const time = dayjs().format("HH:mm:ss");

    const novaMensagem = {
      ...message,
      from,
      time,
    };

    await db.collection("messages").insertOne(novaMensagem);
    res.sendStatus(201);
  } catch (error) {
    console.log("Erro ao inserir participante e/ou mensagem:", error);
    res.status(500).send("Erro no servidor");
  }
});

server.get("/messages", async (req, res) => {
  try {
    const dados = await db.collection("messages").find().toArray();
    console.log(dados);

    return res.send(dados);
  } catch (error) {
    res.status(500).send("Deu erro no servidor de banco de dados");
  }
});

startServer();
