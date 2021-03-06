var WS_URL = 'wss://test-webrtc.glitch.me';
var ICE_SERVERS = [{urls: 'stun:stun.stunprotocol.org'}];

var name = '';
var rtc = null;
var $name = document.getElementById('name');
var $target = document.getElementById('target');
var $targets = document.getElementById('targets');
var $message = document.getElementById('message');
var $send = document.getElementById('send');
var $call = document.getElementById('call');
var $hang = document.getElementById('hang');
var $messages = document.getElementById('messages');
var $status = document.getElementById('status');
var $local = document.getElementById('local');
var $remote = document.getElementById('remote');


function send(conns, req) {
  var msg = JSON.stringify(req);
  // console.log('send', msg);
  for(var conn of conns)
    conn.send(msg);
};

function onOpen(ws) {
  $status.value = 'connection opened';
};

function onEnd(ws) {
  $status.value = 'connection closed';
};

function onClose(ws, req) {
  var {source} = req;
  for(var $option of Array.from($targets.childNodes))
    if($option.value===source) $targets.removeChild($option);
  $status.value = $targets.childNodes.length+' people connected';
};

function onConnections(ws, req) {
  var {targets} = req;
  for(var id of targets) {
    var $option = document.createElement('option');
    $option.value = id;
    $targets.appendChild($option);
  }
  $status.value = $targets.childNodes.length+' people connected';
};

function onConnection(ws, req) {
  var {target} = req;
  var $option = document.createElement('option');
  $option.value = target;
  $targets.appendChild($option);
  $status.value = $targets.childNodes.length+' people connected';
};

function onRename(ws, req) {
  var {source, target} = req;
  if(source==null) return $status.value = $name.value+' not available';
  if(target==null) return $name.value = name = source;
  if(source===name) return $status.value = 'you renamed to '+(name = target);
  for(var $option of Array.from($targets.childNodes))
    if($option.value===source) $option.value = target;
};

function onMessage(ws, req) {
  var {source, target, value} = req;
  if(value==null) return $status.value = 'failed to message '+target;
  if(source===name) $messages.value += '\n->'+target+': '+value;
  else $messages.value += '\n'+source+': '+value;
  if(source===name) $message.value = '';
};

function doRename(ws) {
  send([ws], {type: 'rename', source: name, target: $name.value});
  return false;
};

function doMessage(ws) {
  send([ws], {type: 'message', target: $target.value, value: $message.value});
  return false;
};


function doHang(ws, end) {
  if(!end) send([ws], {type: 'rtc-close', target: $target.value});
  if($remote.srcObject) for(var track of $remote.srcObject.getTracks())
    track.stop();
  if($local.srcObject) for(var track of $local.srcObject.getTracks())
    track.stop();
  rtc.close();
  rtc = null;
  $status.value = 'closing call with '+$target.value;
  return false;
};

function onNegotiationNeeded(ws, rtc) {
  if(rtc.ready) return;
  rtc.ready = true;
  rtc.createOffer().then(offer => {
    return rtc.setLocalDescription(offer);
  }).then(() => {
    console.log('onNegotiationNeeded', rtc.localDescription);
    send([ws], {type: 'rtc-offer', target: $target.value, sdp: rtc.localDescription});
  });
};

function onIceCandidate(ws, rtc, event) {
  var {candidate} = event;
  console.log('onIceCandidate', candidate);
  send([ws], {type: 'rtc-candidate', target: $target.value, candidate});
};

function onTrack(ws, rtc, event) {
  var {streams} = event;
  console.log('onTrack', streams);
  if(!streams || streams.length===0) return;
  $remote.srcObject = streams[0];
  $remote.play();
};

function onRemoveTrack(ws, rtc) {
  var stream = $remote.srcObject;
  var tracks = stream.getTracks();
  console.log('onRemoveTrack', tracks.length);
  if(tracks.length===0) return doHang(ws);
};

function onIceConnectionStateChange(ws, rtc) {
  var state = rtc.iceConnectionState;
  console.log('onIceConnectionStateChange', state);
  if(/closed|failed|disconnected/.test(state)) doHang(ws);
};

function setupRtcConnection(ws) {
  var rtc = new RTCPeerConnection({iceServers: ICE_SERVERS});
  console.log('setupRtcConnection', rtc);
  rtc.onnegotiationneeded = () => onNegotiationNeeded(ws, rtc);
  rtc.onicecandidate = (event) => onIceCandidate(ws, rtc, event);
  rtc.ontrack = (event) => onTrack(ws, rtc, event);
  rtc.onremovetrack = () => onRemoveTrack(ws, rtc);
  rtc.oniceconnectionstatechange = () => onIceConnectionStateChange(ws, rtc);
  rtc.onicegatheringstatechange = () => {};
  rtc.onsignallingstatechange = () => {};
  return rtc;
};

function onRtcOffer(ws, req) {
  var {source, sdp} = req;
  $target.value = source;
  console.log('onRtcOffer', sdp);
  if(rtc!=null) rtc.close();
  rtc = setupRtcConnection(ws);
  rtc.ready = true;
  var desc = new RTCSessionDescription(sdp);
  rtc.setRemoteDescription(desc);
  var constraints = {audio: true, video: true};
  navigator.mediaDevices.getUserMedia(constraints).then(stream => {
    $local.srcObject = stream;
    $local.play();
    for(var track of stream.getTracks())
      rtc.addTrack(track, stream);
    return rtc.createAnswer()
  }).then(answer => {
    return rtc.setLocalDescription(answer);
  }).then(() => {
    console.log('send rtc-answer', rtc.localDescription);
    send([ws], {type: 'rtc-answer', target: source, sdp: rtc.localDescription});
  });
};

function onRtcAnswer(ws, req) {
  var {source, sdp} = req;
  console.log('onRtcAnswer', sdp);
  var desc = new RTCSessionDescription(sdp);
  rtc.setRemoteDescription(desc);
};

function onRtcCandidate(ws, req) {
  var {candidate} = req;
  console.log('onRtcCandidate', candidate);
  if(candidate==null) return;
  var icecandidate = new RTCIceCandidate(candidate);
  rtc.addIceCandidate(icecandidate);
};

function onRtcClose(ws, req) {
  var {source} = req;
  console.log('onRtcClose');
  doHang(ws, true);
};


function doCall(ws) {
  console.log('doCall');
  if(rtc!=null) rtc.close();
  rtc = setupRtcConnection(ws);
  var constraints = {audio: true, video: true};
  navigator.mediaDevices.getUserMedia(constraints).then(stream => {
    for(var track of stream.getTracks()) {
      console.log('rtcAddTrack', track);
      rtc.addTrack(track, stream);
    }
    $local.srcObject = stream;
    $local.play();
  });
  $status.value = 'starting call to '+$target.value;
  return false;
};


var ws = new WebSocket(WS_URL);
ws.onopen = () => onOpen(ws);
ws.onclose = () => onEnd(ws);
ws.onmessage = (event) => {
  var req = JSON.parse(event.data);
  var {type} = req;
  if(type==='close') onClose(ws, req);
  else if(type==='connection') onConnection(ws, req);
  else if(type==='connections') onConnections(ws, req);
  else if(type==='rename') onRename(ws, req);
  else if(type==='message') onMessage(ws, req);
  else if(type==='rtc-offer') onRtcOffer(ws, req);
  else if(type==='rtc-answer') onRtcAnswer(ws, req);
  else if(type==='rtc-candidate') onRtcCandidate(ws, req);
  else if(type==='rtc-close') onRtcClose(ws, req);
  else console.log('unknown request', req);
};
$name.onchange = () => doRename(ws);
$send.onclick = () => doMessage(ws);
$call.onclick = () => doCall(ws);
$hang.onclick = () => doHang(ws);
