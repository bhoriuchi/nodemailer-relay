import nodemailer from '../index';
// process.env.DEBUG_NODEMAILER_RELAY = 'true';

nodemailer.relay({
  from: 'bhoriuchi@gmail.com',
  to: 'bhoriuchi@gmail.com',
  subject: 'test forward',
  text: 'message body'
}, (err, info) => {
  if (err) {
    return console.log('cb:', { err });
  }
  console.log('cb:', JSON.stringify(info, null, '  '));
})
.then(r => {
  console.log(JSON.stringify(r, null, '  '));
})
.catch(err => {
  console.error({ err });
});
