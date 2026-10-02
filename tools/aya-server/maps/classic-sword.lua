-- Self-contained Aiedue classic sword; no LinkedSource or Roblox HTTP assets.
local tool = script.Parent
local handle = tool:WaitForChild('Handle')
local busy = false
local attacking = false
local hits = {}
tool.Activated:connect(function()
 if busy then return end
 local owner = game.Players:GetPlayerFromCharacter(tool.Parent)
 if not owner then return end
 busy = true
 attacking = true
 hits = {}
 print('ROBL_SWORD_SWING '..owner.Name)
 local animation = Instance.new('StringValue')
 animation.Name = 'toolanim'
 animation.Value = 'Slash'
 animation.Parent = tool
 wait(0.35)
 attacking = false
 wait(0.25)
 busy = false
end)
handle.Touched:connect(function(part)
 if not attacking or not part.Parent or part.Parent == tool.Parent then return end
 local humanoid = part.Parent:FindFirstChild('Humanoid')
 if not humanoid or hits[humanoid] then return end
 hits[humanoid] = true
 humanoid:TakeDamage(16)
 print('ROBL_SWORD_HIT '..part.Parent.Name)
end)
