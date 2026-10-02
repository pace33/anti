"""Run: uv run --with lupa python tools/aya-server/tests/test_character_motion.py"""
import pathlib, unittest, math
from lupa import LuaRuntime
source=(pathlib.Path(__file__).resolve().parents[1]/'maps/character-motion.lua').read_text(encoding='utf-8')
lua=LuaRuntime(unpack_returned_tuples=True)
pose,classify=lua.execute(source.split('-- NATIVE RIG DRIVER')[0]+'\nreturn motionPose, classifyMotion')
class MotionTests(unittest.TestCase):
 def test_walk_alternates_arms_and_opposes_legs(self):
  a=pose(16,math.pi/2,0,'walk');b=pose(16,3*math.pi/2,0,'walk')
  self.assertLess(a['ra']*a['la'],0);self.assertLess(a['ra']*a['rh'],0);self.assertLess(a['ra']*b['ra'],0);self.assertGreater(abs(a['rh']),.5)
 def test_idle_resets_feet_and_has_small_breathing(self):
  for t in [0,1,10]:
   p=pose(0,99,t,'idle');self.assertEqual(p['rh'],0);self.assertEqual(p['lh'],0);self.assertLess(abs(p['ra']),.08);self.assertLess(abs(p['bob']),.04)
 def test_jump_fall_and_sit_are_distinct(self):
  self.assertLess(pose(0,0,0,'jump')['ra'],-1.5);self.assertNotEqual(pose(0,0,0,'fall')['ra'],pose(0,0,0,'jump')['ra']);self.assertLess(pose(0,0,0,'sit')['rh'],-1)
 def test_state_transitions(self):
  self.assertEqual(classify(0,0,False,False),'idle');self.assertEqual(classify(16,0,False,False),'walk');self.assertEqual(classify(16,12,True,False),'jump');self.assertEqual(classify(2,-12,True,False),'fall');self.assertEqual(classify(0,0,False,True),'sit')
 def test_pose_bounds_and_no_external_animations(self):
  for s in [0,1,16,200]:
   for ph in [0,1,2,3,4,5]:
    p=pose(s,ph,1,'walk');self.assertTrue(all(math.isfinite(p[k]) and abs(p[k])<2 for k in ['ra','la','rh','lh']))
  self.assertNotIn('AnimationId',source);self.assertNotIn('GetAsync',source);self.assertNotIn('.Anchored =',source)
if __name__=='__main__':unittest.main()
