-- Original lightweight, reference-inspired clothing/hair geometry. No catalog meshes or external textures.
local players=game:GetService('Players')
local http=game:GetService('HttpService')
local generations={}
local function color(rgb)return Color3.new(rgb[1],rgb[2],rgb[3])end
local function buildLook(player,character)
 generations[player]=(generations[player] or 0)+1
 local generation=generations[player]
 local deadline=tick()+10
 repeat wait(0.1) until (character.Parent and character:FindFirstChild('Head') and character:FindFirstChild('Torso') and character:FindFirstChild('Left Leg')) or tick()>deadline
 if player.Character~=character or not character.Parent or generations[player]~=generation then return end
 wait(1.8) -- let the verified base-colour initializer finish
 local ok,preset=pcall(function()return http:JSONDecode(http:GetAsync('http://127.0.0.1:3074/host-avatar/'..tostring(player.UserId),true))end)
 if not ok then print('ROBL_LOOK_ERROR '..player.Name..' profile unavailable');return end
 local previous=character:FindFirstChild('AiedueLook');if previous then previous:Destroy()end
 local model=Instance.new('Model');model.Name='AiedueLook';model.Parent=character
 local parts=0
 local function piece(name,parent,size,offset,rgb,shape)
  local part=Instance.new('Part');part.Name=name;part.FormFactor=Enum.FormFactor.Custom;part.Size=size;part.CanCollide=false;part.Anchored=false;part.Locked=true;part.TopSurface=0;part.BottomSurface=0;part.Color=color(rgb);part.CFrame=parent.CFrame*offset;part.Parent=model
  local mesh=Instance.new('SpecialMesh');mesh.MeshType=shape or Enum.MeshType.Brick
  mesh.Scale=Vector3.new(size.X/part.Size.X,size.Y/part.Size.Y,size.Z/part.Size.Z);mesh.Parent=part
  local weld=Instance.new('Weld');weld.Name='LookWeld';weld.Part0=parent;weld.Part1=part;weld.C0=offset;weld.C1=CFrame.new();weld.Parent=part
  parts=parts+1;return part
 end
 local sphere=Enum.MeshType.Sphere
 local head=character:FindFirstChild('Head');local torso=character:FindFirstChild('Torso')
 local skin=preset.head;local shirt=preset.torso;local pants=preset.legs;local jacket=preset.jacket;local hair=preset.hairColor;local black={0.055,0.06,0.065};local white={0.88,0.87,0.84}
 for _,name in pairs({'Head','Torso','Right Arm','Left Arm','Right Leg','Left Leg'})do local core=character:FindFirstChild(name);if core then core.Transparency=1 end end
 for _,v in pairs(head:GetChildren())do if v:IsA('Decal')then v.Transparency=1 end end
 piece('FaceHead',head,Vector3.new(1.30,1.13,1.08),CFrame.new(),skin,sphere)
 for _,x in pairs({-0.19,0.19})do piece('Eye',head,Vector3.new(0.075,0.105,0.05),CFrame.new(x,0.08,-0.54),black,sphere)end
 for i=0,8 do local t=math.pi+math.pi*i/8;piece('Smile',head,Vector3.new(0.055,0.055,0.045),CFrame.new(math.cos(t)*0.24,-0.14+math.sin(t)*0.17,-0.54),black,sphere)end
 piece('HairCap',head,Vector3.new(1.39,0.68,1.15),CFrame.new(0,0.49,0.045),hair,sphere)
 if preset.hair=='bun' then
  piece('HairBun',head,Vector3.new(0.76,0.75,0.72),CFrame.new(0.05,0.98,0.15),hair,sphere)
  piece('HairTie',head,Vector3.new(0.64,0.14,0.61),CFrame.new(0.04,0.76,0.12),jacket,sphere)
  for _,side in pairs({-1,1})do
   piece('SideCurl',head,Vector3.new(0.26,0.86,0.25),CFrame.new(side*0.57,0.13,-0.25)*CFrame.Angles(0,0,side*0.13),hair,sphere)
   piece('CurlTip',head,Vector3.new(0.25,0.24,0.23),CFrame.new(side*0.52,-0.25,-0.25),hair,sphere)
  end
 else
  for i=0,5 do
   local x=-0.55+i*0.21
   piece('SweptLock',head,Vector3.new(0.28,0.75+0.08*(i%2),0.31),CFrame.new(x,0.39,-0.43)*CFrame.Angles(0,0,-0.22+0.06*i),hair,sphere)
  end
  for _,side in pairs({-1,1})do piece('SideHair',head,Vector3.new(0.25,0.53,0.64),CFrame.new(side*0.61,0.15,0.05),hair,sphere)end
 end
 piece('JacketBody',torso,Vector3.new(1.83,1.82,1.02),CFrame.new(),jacket)
 piece('ShirtFront',torso,Vector3.new(0.89,1.57,0.045),CFrame.new(0,-0.05,-0.54),preset.hair=='bun' and white or shirt)
 for _,side in pairs({-1,1})do
  piece('JacketPanel',torso,Vector3.new(0.48,1.81,0.15),CFrame.new(side*0.66,0,-0.53),jacket)
  piece('Collar',torso,Vector3.new(0.28,0.53,0.14),CFrame.new(side*0.31,0.68,-0.60)*CFrame.Angles(0,0,side*0.24),jacket)
  piece('ShoulderRound',torso,Vector3.new(0.44,0.62,0.89),CFrame.new(side*0.79,0.67,0),jacket,sphere)
 end
 if preset.hair=='bun' then
  for i=0,5 do piece('ShirtStripe',torso,Vector3.new(0.88,0.035,0.02),CFrame.new(0,0.42-i*0.18,-0.57),{0.68,0.67,0.65})end
 else
  piece('ShirtEmblem',torso,Vector3.new(0.32,0.22,0.025),CFrame.new(0,0.24,-0.58),jacket)
 end
 piece('Hem',torso,Vector3.new(1.81,0.12,1.06),CFrame.new(0,-0.86,0),jacket)
 for _,side in pairs({-1,1})do
  local arm=character:FindFirstChild(side==1 and 'Right Arm' or 'Left Arm')
  local leg=character:FindFirstChild(side==1 and 'Right Leg' or 'Left Leg')
  if arm and leg then
   piece('Sleeve',arm,Vector3.new(0.76,1.07,0.81),CFrame.new(0,0.39,0),jacket,sphere)
   piece('Forearm',arm,Vector3.new(0.60,0.90,0.63),CFrame.new(0,-0.27,0),skin,sphere)
   piece('Cuff',arm,Vector3.new(0.67,0.18,0.69),CFrame.new(0,-0.49,0),jacket,sphere)
   piece('HandPalm',arm,Vector3.new(0.20,0.43,0.32),CFrame.new(side*0.20,-0.87,0),skin,sphere)
   piece('HandTop',arm,Vector3.new(0.46,0.16,0.32),CFrame.new(0,-0.70,0),skin,sphere)
   piece(side==1 and 'RightHand' or 'LeftHand',arm,Vector3.new(0.46,0.16,0.32),CFrame.new(0,-1.04,0),skin,sphere)
   piece('Trouser',leg,Vector3.new(0.76,1.62,0.81),CFrame.new(0,0.11,0),pants)
   piece('KneeRound',leg,Vector3.new(0.78,0.65,0.83),CFrame.new(0,0.14,0),pants,sphere)
   piece('Shoe',leg,Vector3.new(0.91,0.58,1.20),CFrame.new(0,-0.74,-0.12),black,sphere)
   piece('Sole',leg,Vector3.new(0.91,0.13,1.12),CFrame.new(0,-0.94,-0.10),white)
  end
 end
 local kind=Instance.new('StringValue');kind.Name='LookStyle';kind.Value=preset.hair;kind.Parent=model
 print('ROBL_LOOK_READY '..player.Name..' '..preset.id..' hair='..preset.hair..' parts='..tostring(parts))
end
local function attach(player)
 player.CharacterAdded:connect(function(character)spawn(function()local ok,err=pcall(function()buildLook(player,character)end);if not ok then print('ROBL_LOOK_ERROR '..player.Name..' '..tostring(err))end end)end)
 if player.Character then spawn(function()buildLook(player,player.Character)end)end
end
players.PlayerAdded:connect(attach);players.PlayerRemoving:connect(function(p)generations[p]=nil end)
for _,player in pairs(players:GetPlayers())do attach(player)end
