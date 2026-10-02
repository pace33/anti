-- Host-only preset lookup: no UID, password, token or external asset URL is placed in the map.
local function applyAiedueAvatar(player, character)
 local http=game:GetService('HttpService')
 local ok,preset=pcall(function()
  return http:JSONDecode(http:GetAsync('http://127.0.0.1:3074/host-avatar/'..tostring(player.UserId),true))
 end)
 if not ok then print('ROBL_AVATAR_ERROR '..player.Name..' '..tostring(preset));return false end
 local groups={Head=preset.head,Torso=preset.torso,['Left Arm']=preset.head,['Right Arm']=preset.head,['Left Leg']=preset.legs,['Right Leg']=preset.legs}
 for attempt=1,3 do
  for name,rgb in pairs(groups) do
   local part=character:FindFirstChild(name)
   if part then part.Color=Color3.new(rgb[1],rgb[2],rgb[3]) end
  end
  wait(0.2)
 end
 print('ROBL_AVATAR_APPLIED '..player.Name)
 return true
end
