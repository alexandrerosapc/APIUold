import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";
import joi from "joi";

dotenv.config();

const mongoClient = new MongoClient(process.env.DATABASE_URL);

const server = express();

server.use(express.json());
server.use(cors());

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

    const result = await db.collection("participantes").insertOne({ name: participante.name });
    
    res.status(201).send({ id: result.insertedId, message: "Participante criado com sucesso" });
  } catch (error) {
    console.log("Erro ao inserir participante:", error);
    res.status(500).send("Erro no servidor");
  }
});


startServer();
