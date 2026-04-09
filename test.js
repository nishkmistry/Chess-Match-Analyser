const fetchUrl = require('node:https').request;

async function testApi() {
  const data = JSON.stringify({ username: 'hikaru' });

  const getReq = fetchUrl('https://chess-match-analyser.netlify.app/api/matches', {
    method: 'GET'
  }, (res) => {
    console.log('GET /api/matches STATUS:', res.statusCode);
    let body = '';
    res.on('data', d => body += d);
    res.on('end', () => console.log('GET BODY:', body));
  });
  getReq.end();

  const postReq = fetchUrl('https://chess-match-analyser.netlify.app/api/matches/fetch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length
    }
  }, (res) => {
    console.log('POST /api/matches/fetch STATUS:', res.statusCode);
    let body = '';
    res.on('data', d => body += d);
    res.on('end', () => console.log('POST BODY:', body));
  });
  
  postReq.write(data);
  postReq.end();
}

testApi();
