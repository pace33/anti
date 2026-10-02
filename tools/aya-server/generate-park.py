"""Generate an original test place; no third-party map or uploaded scripts."""
from pathlib import Path
from xml.sax.saxutils import escape

parts = []
def block(name, xyz, size, color=102, kind='Part'):
    x,y,z=xyz; sx,sy,sz=size
    parts.append(f'''<Item class="{kind}" referent="RBX{len(parts)+1}"><Properties>
<string name="Name">{escape(name)}</string><bool name="Anchored">true</bool>
<bool name="CanCollide">true</bool><bool name="Locked">false</bool>
<CoordinateFrame name="CFrame"><X>{x}</X><Y>{y}</Y><Z>{z}</Z><R00>1</R00><R01>0</R01><R02>0</R02><R10>0</R10><R11>1</R11><R12>0</R12><R20>0</R20><R21>0</R21><R22>1</R22></CoordinateFrame>
<Vector3 name="size"><X>{sx}</X><Y>{sy}</Y><Z>{sz}</Z></Vector3>
<int name="BrickColor">{color}</int><token name="TopSurface">0</token><token name="BottomSurface">0</token>
</Properties></Item>''')

block('Aiedue Park', (0,-1,0),(150,2,150),37)
block('Spawn',(0,1,0),(12,1,12),102,'SpawnLocation')
for i in range(10):
    block(f'Jump {i+1}', (18+i*7,2+i%3,-15-i*4),(5,1,5),[102,23,1018,24][i%4])
for x,z in [(-30,-30),(30,-30),(-30,30),(30,30)]:
    block('Tree trunk',(x,4,z),(3,8,3),217)
    block('Tree crown',(x,10,z),(12,8,12),37)
block('Blue tower',(-40,6,0),(12,12,12),23)
block('Pink tower',(-40,14,0),(8,4,8),1018)
block('Yellow bench',(20,1,12),(12,2,4),24)
script = '''print("[AIEDUE] Original park loaded")
local function report(player)
  print("[AIEDUE] PLAYER_JOIN " .. player.Name)
  player.CharacterAdded:connect(function(character)
    print("[AIEDUE] CHARACTER_READY " .. player.Name)
    spawn(function()
      for i=1,120 do
        wait(2)
        local torso=character:FindFirstChild("HumanoidRootPart") or character:FindFirstChild("Torso")
        if torso then
          local p=torso.Position
          print(string.format("[AIEDUE] POS %s %.2f %.2f %.2f",player.Name,p.X,p.Y,p.Z))
        end
      end
    end)
  end)
end
game.Players.PlayerAdded:connect(report)
for _,player in pairs(game.Players:GetPlayers()) do report(player) end
'''
parts.append('<Item class="Script" referent="RBXScript"><Properties><string name="Name">AiedueTestTelemetry</string><bool name="Disabled">false</bool><ProtectedString name="Source"><![CDATA['+script+']]></ProtectedString></Properties></Item>')
xml='<roblox xmlns:xmime="http://www.w3.org/2005/05/xmlmime" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" version="4"><External>null</External><External>nil</External><Item class="Workspace" referent="RBXWorkspace"><Properties><string name="Name">Workspace</string><float name="Gravity">196.2</float></Properties>'+''.join(parts)+'</Item></roblox>'
Path(__file__).with_name('test-park.rbxlx').write_text(xml,encoding='utf-8')
print('Original park written:',len(parts),'instances')
