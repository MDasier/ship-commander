const WebSocket = require("ws");
const crypto = require("crypto");

const wss = new WebSocket.Server({
  port: 8080
});

const clients = new Map();
const rooms = {};

const WORLD_W = 3000;
const WORLD_H = 3000;

function createPlayer(id){

  return {
    id,
    roomId:null,
    name:"Pilot",
    team:null,
    ready:false,
    dead:false,
    hp:100,
    fuel:100,
    missileCooldown: 0,
    bulletCooldown: 0,
    missilesActive: 0,
    lockedOnMe: 0,
    flaredCooldown: 0,
    x:0,
    y:0,
    vx:0,
    vy:0,
    angle:0,
    input:{},
    kills: 0,
    deaths: 0,
    hitFlash: 0
  };
}

function send(ws,data){

  if(ws.readyState===1){

    ws.send(JSON.stringify(data));

  }
}

function broadcastRoom(room,data){

  const payload = JSON.stringify(data);

  Object.keys(room.players).forEach(id=>{

    const ws = clients.get(id);

    if(ws && ws.readyState===1){

      ws.send(payload);

    }

  });
}

function createRoom(ownerId){

  const id = crypto.randomUUID();

  rooms[id] = {

    id,

    status:"waiting",

    ownerId,

    players:{},

    bullets:[],

    missiles:[],

    asteroids:[
      {x:1000,y:900,r:80},
      {x:1700,y:1200,r:120},
      {x:2100,y:1800,r:60},
      {x:1300,y:2200,r:100}
    ],

    winner:null,
    killFeed:[]
  };

  return rooms[id];
}

function joinRoom(player,room){

  player.roomId = room.id;

  room.players[player.id] = player;
}

function startGame(room){

  room.status="playing";

  room.bullets=[];
  room.missiles=[];
  room.flare=[];

  room.winner=null;
  room.shipsDestroyed=false;

  let green=0;
  let red=0;

  Object.values(room.players).forEach(p=>{

    p.dead=false;

    p.hp=100;
    p.fuel=100;

    p.vx=0;
    p.vy=0;

    p.angle=0;

    if(green<=red){

      p.team="green";

      p.x=300+Math.random()*200;
      p.y=1000+Math.random()*500;

      green++;

    }else{

      p.team="red";

      p.x=2500+Math.random()*200;
      p.y=1000+Math.random()*500;

      red++;

    }

  });

  room.gameValid = green > 0 && red > 0;

  broadcastRoom(room,{
    type:"gameStarted"
  });
}

function pushKill(room, killer, victim, weapon){
  room.killFeed.unshift({
    killerName: killer ? killer.name : null,
    killerTeam: killer ? killer.team : null,
    victimName: victim.name,
    victimTeam: victim.team,
    weapon,
    time: Date.now()
  });
  if(room.killFeed.length > 6) room.killFeed.pop();
}

function restartRoom(room){
  room.status = "waiting";
  room.bullets = [];
  room.missiles = [];
  room.flare = [];
  room.winner = null;
  room.killFeed = [];
  room.shipsDestroyed = false;
  room.gameValid = false;

  Object.values(room.players).forEach(p => {
    p.ready = false;
    p.dead = false;
    p.hp = 100;
    p.fuel = 100;
    p.vx = 0;
    p.vy = 0;
    p.kills = 0;
    p.deaths = 0;
    p.hitFlash = 0;
    p.input = {};
    p.missileCooldown = 0;
    p.bulletCooldown = 0;
    p.flaredCooldown = 0;
  });

  broadcastRoom(room, { type: "roomRestarted", room });
}

function removeFromRoom(player){

  if(!player.roomId) return;

  const room = rooms[player.roomId];

  if(!room) return;

  delete room.players[player.id];

  player.roomId = null;

  if(Object.keys(room.players).length === 0){

    delete rooms[room.id];

  }else{

    broadcastRoom(room,{
      type:"roomUpdate",
      room
    });

  }
}

function roomList(){

  return Object.values(rooms).map(r=>({

    id:r.id,

    players:Object.keys(r.players).length,

    status:r.status

  }));
}

wss.on("connection",ws=>{

  const id = crypto.randomUUID();

  const player = createPlayer(id);

  ws.player = player;

  clients.set(id,ws);

  send(ws,{
    type:"init",
    id
  });

  send(ws,{
    type:"rooms",
    rooms:roomList()
  });

  ws.on("message",raw=>{

    let msg;
    try{
      msg = JSON.parse(raw);
    }catch(e){
      return;
    }

    if(msg.type === "getRooms"){
      send(ws, {
        type: "rooms",
        rooms: roomList()
      });
      return;
    }

    if(msg.type === "setName"){
      const raw = String(msg.name || "").trim();
      player.name = raw.replace(/[^\w\sÀ-ɏ\-\.]/g, "").slice(0, 16) || "Pilot";
      const room = rooms[player.roomId];
      if(room) broadcastRoom(room, { type: "roomUpdate", room });
      return;
    }

    if(msg.type==="leaveRoom"){
      removeFromRoom(player);
      return;
    }

    if(msg.type==="createRoom"){
      const room = createRoom(id);
      joinRoom(player,room);
      send(ws,{
        type:"roomJoined",
        roomId:room.id
      });
      broadcastRoom(room,{
        type:"roomUpdate",
        room
      });
      return;
    }

    if(msg.type==="joinRoom"){
      const room = rooms[msg.roomId];
      if(!room) return;
      if(room.status !== "waiting") return;
      if(Object.keys(room.players).length>=6) return;
      joinRoom(player,room);
      send(ws,{
        type:"roomJoined",
        roomId:room.id
      });
      broadcastRoom(room,{
        type:"roomUpdate",
        room
      });
      return;
    }

    if(msg.type==="ready"){
      const room = rooms[player.roomId];
      if(!room) return;

      if(room.status !== "waiting") return;

      player.ready = !player.ready;

      broadcastRoom(room,{
        type:"roomUpdate",
        room
      });

      const list = Object.values(room.players);

      const allReady =
        list.length >= 1 &&
        list.every(p=>p.ready);

      if(allReady){

        startGame(room);

      }

      return;
    }

    if(msg.type === "switchTeam"){
      const room = rooms[player.roomId];
      if(!room) return;

      if(room.status === "playing"){
        // En partida: solo si estás muerto
        if(!player.dead) return;
        player.team = player.team === "green" ? "red" : "green";
        // El siguiente broadcast de state ya incluye el equipo actualizado
        return;
      }

      // En lobby: comportamiento normal
      player.team = player.team === "green" ? "red" : "green";
      player.dead = false;
      player.hp = 100;
      player.fuel = 100;
      player.vx = 0;
      player.vy = 0;
      player.targetId = null;

      broadcastRoom(room, {
        type: "roomUpdate",
        room
      });
      return;
    }

    if(msg.type==="input"){

      player.input = msg;

      return;
    }

    if(msg.type === "flare"){
      const room = rooms[player.roomId];
      if(!room) return;
    
      if(player.flaredCooldown > 0) return;
    
      room.flare = room.flare || [];
    
      room.flare.push({
        x: player.x,
        y: player.y,
        life: 90,
        team: player.team
      });
    
      player.flaredCooldown = 460; 
    }

    if(msg.type === "missile"){

      const room = rooms[player.roomId];
      if(!room) return;
    
      if(player.dead) return;
    
      // cooldown check
      if(player.missileCooldown > 0) return;
    
      // limit active missiles
      const active = room.missiles.filter(m => m.ownerId === player.id).length;
      if(active >= 6) return;
    
      room.missiles.push({
        x: player.x,
        y: player.y,
        vx: Math.cos(player.angle) * 8,
        vy: Math.sin(player.angle) * 8,
        team: player.team,
        targetId: msg.targetId,
        ownerId: player.id,
        life: 300
      });
    
      player.missileCooldown = 150; // 5s @ 30fps
    }

    if(msg.type === "selfDestruct"){
      const room = rooms[player.roomId];
      if(!room || room.status !== "playing") return;
      if(player.dead) return;
      player.dead = true;
      player.hp = 0;
      player.deaths++;
      room.shipsDestroyed = true;
      pushKill(room, null, player, "self");
      return;
    }

    if(msg.type === "restartGame"){
      const room = rooms[player.roomId];
      if(!room) return;
      if(room.ownerId !== player.id) return;
      if(room.status !== "playing") return;
      restartRoom(room);
      return;
    }

    if(msg.type === "chat"){
      const room = rooms[player.roomId];
      if(!room || room.status !== "playing") return;
      const text = String(msg.text || "").trim().slice(0, 60);
      if(!text) return;
      broadcastRoom(room, {
        type: "chat",
        name: player.name,
        team: player.team,
        text
      });
      return;
    }

    if(msg.type==="shoot"){

      const room = rooms[player.roomId];

      if(!room) return;

      if(player.dead) return;

      if(player.bulletCooldown > 0) return;

      player.bulletCooldown = 5;

      room.bullets.push({

        x:player.x,
        y:player.y,

        vx:Math.cos(player.angle)*12,
        vy:Math.sin(player.angle)*12,

        team:player.team,
        ownerId:player.id
      });
    }

  });

  ws.on("close",()=>{

    removeFromRoom(player);
    clients.delete(id);

  });

});

function steerMissile(m, tx, ty, maxTurn, thrust){
  const dx = tx - m.x;
  const dy = ty - m.y;
  const currentSpeed = Math.hypot(m.vx, m.vy);
  const currentAngle = currentSpeed > 0.5
    ? Math.atan2(m.vy, m.vx)
    : Math.atan2(dy, dx);
  const desiredAngle = Math.atan2(dy, dx);
  let diff = desiredAngle - currentAngle;
  if(diff >  Math.PI) diff -= 2 * Math.PI;
  if(diff < -Math.PI) diff += 2 * Math.PI;
  const newAngle = currentAngle + Math.max(-maxTurn, Math.min(maxTurn, diff));
  m.vx += Math.cos(newAngle) * thrust;
  m.vy += Math.sin(newAngle) * thrust;
}

function update(){

  Object.values(rooms).forEach(room => {

    if(room.status !== "playing") return;

    // =====================
    // PLAYERS UPDATE
    // =====================
    Object.values(room.players).forEach(p => {

      if(p.dead) return;
      p.lockedByMissile = false;
      p.lockedOnMe = 0;

      if (p.missileCooldown > 0) p.missileCooldown -= 1;
      if (p.bulletCooldown > 0) p.bulletCooldown -= 1;
      if (p.hitFlash > 0) p.hitFlash -= 1;
      if (p.flaredCooldown > 0) p.flaredCooldown -= 1;

      const i = p.input || {};

      if(i.left)  p.angle -= 0.08;
      if(i.right) p.angle += 0.08;

      if(i.thrust && p.fuel > 0){
        p.vx += Math.cos(p.angle) * 0.25;
        p.vy += Math.sin(p.angle) * 0.25;
        p.fuel = Math.max(0, p.fuel - 0.05);
      } else if(i.reverse && p.fuel > 0){
        p.vx -= Math.cos(p.angle) * 0.10;
        p.vy -= Math.sin(p.angle) * 0.10;
        p.fuel = Math.max(0, p.fuel - 0.03);
      } else if(p.fuel < 100){
        p.fuel = Math.min(100, p.fuel + 0.015);
      }

      p.vx *= 0.99;
      p.vy *= 0.99;

      p.x += p.vx;
      p.y += p.vy;

      p.x = Math.max(0, Math.min(WORLD_W, p.x));
      p.y = Math.max(0, Math.min(WORLD_H, p.y));
    });

    // =====================
    // ASTEROIDS COLLISION
    // =====================
    Object.values(room.players).forEach(p => {

      if(p.dead) return;

      for(const asteroid of room.asteroids){

        const dx = p.x - asteroid.x;
        const dy = p.y - asteroid.y;

        const dist = Math.hypot(dx, dy);
        const minDist = asteroid.r + 14;

        if(dist < minDist){

          const nx = dx / (dist || 1);
          const ny = dy / (dist || 1);

          p.x = asteroid.x + nx * minDist;
          p.y = asteroid.y + ny * minDist;

          const impact = Math.hypot(p.vx, p.vy);

          p.vx *= -0.4;
          p.vy *= -0.4;

          if(impact > 3){
            p.hp -= Math.floor(impact * 4);
            p.hitFlash = 8;

            if(p.hp <= 0){
              p.hp = 0;
              p.dead = true;
              p.deaths++;
              room.shipsDestroyed = true;
              pushKill(room, null, p, "asteroid");
            }
          }
        }
      }
    });

    // =====================
    // BULLETS
    // =====================
    room.bullets.forEach(b => {
      b.x += b.vx;
      b.y += b.vy;
    });

    room.bullets = room.bullets.filter(b =>
      b.x > -100 &&
      b.x < WORLD_W + 100 &&
      b.y > -100 &&
      b.y < WORLD_H + 100
    );

    // =====================
    // BULLET COLLISION
    // =====================
    for(let i = room.bullets.length - 1; i >= 0; i--){
      const b = room.bullets[i];

      for(const p of Object.values(room.players)){
        if(p.dead) continue;
        if(p.team === b.team) continue;

        const d = Math.hypot(p.x - b.x, p.y - b.y);

        if(d < 15){
          p.hp -= 25;
          p.hitFlash = 8;

          if(p.hp <= 0){
            p.dead = true;
            p.hp = 0;
            p.deaths++;
            room.shipsDestroyed = true;
            const killer = room.players[b.ownerId];
            if(killer && killer.id !== p.id) killer.kills++;
            pushKill(room, killer || null, p, "bullet");
          }

          room.bullets.splice(i, 1);
          break;
        }
      }
    }

    // =====================
    // MISSILES UPDATE
    // =====================
    room.missiles.forEach(m => {

      const target = room.players[m.targetId];
    
      if(target && !target.dead){
        target.lockedByMissile = true;
        target.lockedOnMe++;
      }
    
      // ===== FLARE INTERACTION (decoy)
      const flares = room.flare || [];
      let distracted = false;

      for(const f of flares){
        const d = Math.hypot(m.x - f.x, m.y - f.y);
        if(d < 160){
          steerMissile(m, f.x, f.y, 0.20, 0.6);
          distracted = true;
          break;
        }
      }

      // ===== NORMAL TRACKING
      if(!distracted && target && !target.dead){
        steerMissile(m, target.x, target.y, 0.13, 0.55);
      }

      // ===== SPEED LIMIT
      const speed = Math.hypot(m.vx, m.vy);
      const maxSpeed = 16;

      if(speed > maxSpeed){
        m.vx = (m.vx / speed) * maxSpeed;
        m.vy = (m.vy / speed) * maxSpeed;
      }
    
      m.x += m.vx;
      m.y += m.vy;
    
      // VIDA SIEMPRE
      m.life -= 1;
    });

    // =====================
    // MISSILE CLEANUP
    // =====================
    room.missiles = room.missiles.filter(m => m.life > 0);

    // =====================
    // MISSILE COLLISION
    // =====================
    for(let i = room.missiles.length - 1; i >= 0; i--){

      const m = room.missiles[i];

      for(const p of Object.values(room.players)){

        if(p.dead) continue;
        if(p.team === m.team) continue;

        const d = Math.hypot(p.x - m.x, p.y - m.y);

        if(d < 18){

          p.hp -= 40;
          p.hitFlash = 8;

          if(p.hp <= 0){
            p.hp = 0;
            p.dead = true;
            p.deaths++;
            room.shipsDestroyed = true;
            const killer = room.players[m.ownerId];
            if(killer && killer.id !== p.id) killer.kills++;
            pushKill(room, killer || null, p, "missile");
          }

          room.missiles.splice(i, 1);
          break;
        }
      }
    }

    // =====================
    // FLARES UPDATE
    // =====================
    room.flare = (room.flare || []).filter(f => {
      f.life--;
      return f.life > 0;
    });

    // =====================
    // WIN CONDITION
    // =====================
    const greenAlive =
      Object.values(room.players)
        .filter(p => p.team === "green" && !p.dead).length;

    const redAlive =
      Object.values(room.players)
        .filter(p => p.team === "red" && !p.dead).length;

    if(room.gameValid && room.shipsDestroyed){
      if(greenAlive === 0) room.winner = "red";
      if(redAlive === 0) room.winner = "green";
    }

    // =====================
    // BROADCAST
    // =====================
    broadcastRoom(room, {
      type: "state",
      players: room.players,
      bullets: room.bullets,
      missiles: room.missiles,
      flare: room.flare || [],
      asteroids: room.asteroids,
      winner: room.winner,
      killFeed: room.killFeed,
      world: {
        width: WORLD_W,
        height: WORLD_H
      }
    });

  });
}

setInterval(update,1000/30);

console.log("Server running on ws://localhost:8080");