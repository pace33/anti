-- Original asset-free R6 motion. Pose maths is independent of the native rig driver.
local function classifyMotion(speed, verticalSpeed, airborne, seated)
 if seated then return 'sit' end
 if airborne or math.abs(verticalSpeed)>5 then
  if verticalSpeed>1 then return 'jump' end
  return 'fall'
 end
 if speed>0.7 then return 'walk' end
 return 'idle'
end
local function motionPose(speed, phase, now, state)
 local p={ra=0,la=0,rh=0,lh=0,roll=0.035,bob=0,pitch=0}
 if state=='walk' then
  local weight=math.min(1,math.max(0,speed/12))
  local swing=math.sin(phase)*weight
  p.ra=swing*0.82;p.la=-p.ra;p.rh=-swing*0.95;p.lh=-p.rh
  p.bob=(1-math.cos(phase*2))*0.032*weight;p.pitch=-0.045*weight
 elseif state=='jump' then
  p.ra=-math.pi;p.la=-math.pi;p.rh=-0.3;p.lh=0.15;p.pitch=-0.035;p.roll=0.10
 elseif state=='fall' then
  p.ra=-1.05;p.la=-1.05;p.rh=0.08;p.lh=-0.08;p.roll=0.18
 elseif state=='sit' then
  p.rh=-1.45;p.lh=-1.45;p.ra=-0.2;p.la=-0.2
 else
  p.ra=math.sin(now*1.7)*0.035;p.la=-p.ra;p.bob=math.sin(now*1.7)*0.018
 end
 return p
end

-- NATIVE RIG DRIVER
local players=game:GetService('Players')
print('ROBL_MOTION_BOOT')
local http=game:GetService('HttpService')
local rigs={}
local generations={}
local function jointFor(character, torso, name, limb)
 local joint=torso:FindFirstChild(name)
 if joint then return joint end
 -- Some legacy avatars use named Welds rather than Motor6Ds.
 for _,part in pairs(character:GetChildren()) do
  for _,child in pairs(part:GetChildren()) do
   if child:IsA('JointInstance') and child.Part0==torso and child.Part1==limb then return child end
  end
 end
end
local function bindJoint(joint, limb)
 if not joint then return nil end
 local base=joint.C0
 return {joint=joint,limb=limb,base=base,position=CFrame.new(base.p),rotation=base-base.p,current=base}
end
local function quietDefault(character)
 local animate=character:FindFirstChild('Animate')
 if animate and animate:IsA('LocalScript') then animate.Disabled=true end
end
local function attachCharacter(player,character)
 generations[player]=(generations[player] or 0)+1
 local generation=generations[player]
 print('ROBL_MOTION_BIND '..player.Name)
 local deadline=tick()+10
 local torso,humanoid,ra,la,rh,lh
 repeat
  if generations[player]~=generation then return end
  torso=character:FindFirstChild('Torso');humanoid=character:FindFirstChild('Humanoid')
  ra=character:FindFirstChild('Right Arm');la=character:FindFirstChild('Left Arm')
  rh=character:FindFirstChild('Right Leg');lh=character:FindFirstChild('Left Leg')
  if character.Parent and player.Character==character and torso and humanoid and ra and la and rh and lh then break end
  wait(0.1)
 until tick()>deadline
 if player.Character~=character or not character.Parent then return end
 if not (torso and humanoid and ra and la and rh and lh) then print('ROBL_MOTION_ERROR '..player.Name..' missing R6 parts');return end
 local joints={ra=bindJoint(jointFor(character,torso,'Right Shoulder',ra),ra),la=bindJoint(jointFor(character,torso,'Left Shoulder',la),la),rh=bindJoint(jointFor(character,torso,'Right Hip',rh),rh),lh=bindJoint(jointFor(character,torso,'Left Hip',lh),lh)}
 if not (joints.ra and joints.la and joints.rh and joints.lh) then
  local found={};for _,v in pairs(torso:GetChildren()) do table.insert(found,v.Name..':'..v.ClassName) end
  print('ROBL_MOTION_ERROR '..player.Name..' missing joints '..table.concat(found,','));return
 end
 local root=character:FindFirstChild('HumanoidRootPart') or torso
 local rootJoint=root:FindFirstChild('RootJoint') or torso:FindFirstChild('RootJoint')
 local rig={player=player,character=character,torso=torso,humanoid=humanoid,root=root,joints=joints,rootJoint=bindJoint(rootJoint,torso),lastPosition=root.Position,phase=0,speed=0,lastLog=0}
 rigs[player]=rig
 quietDefault(character)
 rig.childConnection=character.ChildAdded:connect(function() quietDefault(character) end)
 print('ROBL_MOTION_READY '..player.Name..' joints=4')
end
local function release(player)
 local rig=rigs[player]
 if rig then
  if rig.childConnection then rig.childConnection:disconnect() end
  for _,j in pairs(rig.joints) do if j.joint.Parent then j.joint.C0=j.base end end
  if rig.rootJoint and rig.rootJoint.joint.Parent then rig.rootJoint.joint.C0=rig.rootJoint.base end
 end
 rigs[player]=nil
end
local function attachPlayer(player)
 player.CharacterAdded:connect(function(character) release(player);attachCharacter(player,character) end)
 if player.Character then spawn(function() attachCharacter(player,player.Character) end) end
end
players.PlayerAdded:connect(attachPlayer)
players.PlayerRemoving:connect(function(player) generations[player]=(generations[player] or 0)+1;release(player);generations[player]=nil end)
for _,player in pairs(players:GetPlayers()) do attachPlayer(player) end
local function writeJoint(j,angle,roll,alpha)
 local target=j.position*CFrame.Angles(angle,0,roll or 0)*j.rotation
 j.current=j.current:lerp(target,alpha)
 j.joint.C0=j.current
end
local function upVector(torso,part)
 local relative=torso.CFrame:inverse()*part.CFrame
 local v=relative*Vector3.new(0,1,0)-relative.p
 return {v.X,v.Y,v.Z}
end
while true do
 local elapsed=wait(1/25)
 local dt=math.max(0.01,math.min(0.15,elapsed or 0.04))
 local now=tick()
 for player,rig in pairs(rigs) do
  if player.Character~=rig.character or not rig.character.Parent or rig.humanoid.Health<=0 then release(player)
  else
   local ok,err=pcall(function()
    local position=rig.root.Position
    local delta=position-rig.lastPosition;rig.lastPosition=position
    local speed=math.sqrt(delta.X*delta.X+delta.Z*delta.Z)/dt
    local vertical=delta.Y/dt
    if speed>90 or math.abs(vertical)>100 then speed=0;vertical=0 end -- respawn/teleport, not a stride
    rig.speed=rig.speed+(math.min(speed,32)-rig.speed)*(1-math.exp(-9*dt))
    local air=false
    local state=rig.humanoid:GetState()
    local name=tostring(state)
    air=string.find(name,'Jumping')~=nil or string.find(name,'Freefall')~=nil
    local poseState=classifyMotion(rig.speed,vertical,air,rig.humanoid.Sit)
    if poseState=='jump' then rig.raisedUntil=now+0.3 end
    if rig.raisedUntil and now<rig.raisedUntil then poseState='jump' end
    rig.phase=(rig.phase+rig.speed*dt*0.66)%(math.pi*2)
    local pose=motionPose(rig.speed,rig.phase,now,poseState)
    local alpha=poseState=='jump' and 1 or (1-math.exp(-14*dt))
    writeJoint(rig.joints.ra,pose.ra,pose.roll,alpha);writeJoint(rig.joints.la,pose.la,-pose.roll,alpha)
    writeJoint(rig.joints.rh,pose.rh,0,alpha);writeJoint(rig.joints.lh,pose.lh,0,alpha)
    if rig.rootJoint then
     local j=rig.rootJoint
     local target=CFrame.new(0,pose.bob,0)*CFrame.Angles(pose.pitch,0,0)*j.base
     j.current=j.current:lerp(target,alpha);j.joint.C0=j.current
    end
    local logInterval=(poseState=='jump' or poseState=='fall') and 0.1 or 0.5
    if now-rig.lastLog>=logInterval then
     rig.lastLog=now
     local head=rig.character:FindFirstChild('Head') or rig.torso
     local look=rig.character:FindFirstChild('AiedueLook')
     local rightHand=look and look:FindFirstChild('RightHand');local leftHand=look and look:FindFirstChild('LeftHand')
     print('ROBL_MOTION '..http:JSONEncode({name=player.Name,state=poseState,speed=rig.speed,phase=rig.phase,ra=upVector(rig.torso,rig.joints.ra.limb),la=upVector(rig.torso,rig.joints.la.limb),rh=upVector(rig.torso,rig.joints.rh.limb),lh=upVector(rig.torso,rig.joints.lh.limb),headY=head.Position.Y,handRY=rightHand and rightHand.Position.Y or (rig.joints.ra.limb.CFrame*Vector3.new(0,-1.04,0)).Y,handLY=leftHand and leftHand.Position.Y or (rig.joints.la.limb.CFrame*Vector3.new(0,-1.04,0)).Y}))
    end
   end)
   if not ok then print('ROBL_MOTION_ERROR '..player.Name..' '..tostring(err));release(player) end
  end
 end
end
