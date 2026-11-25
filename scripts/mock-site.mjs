import express from 'express';
import multer from 'multer';

export function createMockSite({ log = console.log } = {}) {
  const app = express();
  const upload = multer({ storage: multer.memoryStorage() });
  app.use(express.urlencoded({ extended: true }));

  app.get('/login', (req, res) => {
    res.send(`<form method="post" action="/login">
      <input id="u" name="u"><input id="p" name="p" type="password">
      <button id="login-btn" type="submit">OK</button></form>`);
  });
  app.post('/login', (req, res) => res.redirect('/home'));
  app.get('/home', (req, res) => res.send(`<a id="logout" href="/login">Déconnexion</a>`));

  app.get('/expense/new', (req, res) => {
    res.send(`<form method="post" action="/expense/new" enctype="multipart/form-data">
      <input id="date" name="date"><input id="amount" name="amount"><input id="merchant" name="merchant">
      <select id="cat" name="cat">
        <option>Repas</option><option>Courses</option><option>Carburant</option><option>Transport</option>
        <option>Hébergement</option><option>Fournitures</option><option>Télécom</option><option>Santé</option><option>Autre</option>
      </select>
      <input id="comment" name="comment"><input id="file" name="justif" type="file">
      <button id="submit" type="submit">Envoyer</button></form>`);
  });
  app.post('/expense/new', upload.single('justif'), (req, res) => {
    log('note reçue:', JSON.stringify({ ...req.body, justif: req.file?.originalname || null }));
    res.send(`<div class="ok">Note créée</div><span class="ref">NDF-TEST-0001</span>`);
  });

  return app;
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/^.*\//, ''));
if (isMain) {
  const port = Number(process.env.MOCK_PORT || 4799);
  createMockSite().listen(port, '127.0.0.1', () => {
    console.log(`faux site de notes de frais: http://127.0.0.1:${port}/login`);
  });
}
