const bcrypt = require('bcryptjs');

const hash = "$2b$10$MMVt89bYGskfaXxIBthnK.KmHDv0gUjYxgRBjJ1.wzyVKjKMo28eq";
const plain = "Password123!";

bcrypt.compare(plain, hash).then(res => {
    console.log("Match:", res);
});
