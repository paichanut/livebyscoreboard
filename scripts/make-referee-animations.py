"""Original animated referee pictograms, based on IIHF 2026/27 Appendix I.

One pose model supplies both the website's animated SVGs and optional GIF previews.
Run with --samples to render the three chat previews using Pillow.
"""
import argparse
import json
import math
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
DOWN_L = [35, 48, 37, 63]
DOWN_R = [65, 48, 63, 63]


def mix(a, b, amount):
    return [round(x + (y - x) * amount, 3) for x, y in zip(a, b)]


def poses(left, right, motion='raise', away_left=None, away_right=None):
    if motion == 'rotate':
        return [{'at': i / 32, 'left': [33, 48, round(50 + 9 * math.cos(i * math.pi / 8), 3), round(44 + 7 * math.sin(i * math.pi / 8), 3)],
                 'right': [67, 48, round(50 - 9 * math.cos(i * math.pi / 8), 3), round(44 - 7 * math.sin(i * math.pi / 8), 3)]} for i in range(33)]
    away_left = away_left or (DOWN_L if motion == 'raise' else left)
    away_right = away_right or (DOWN_R if motion == 'raise' else right)
    beats = [(0, 1), (.12, 0), (.25, 1), (.38, 0), (.5, 1), (.82, 1), (1, 1)] if motion == 'tap' else [(0, 1), (.3, 1), (.43, 0), (.57, 0), (.8, 1), (1, 1)]
    return [{'at': at, 'left': mix(away_left, left, amount), 'right': mix(away_right, right, amount)} for at, amount in beats]


SIGNALS = [
    {'id': 'charging', 'name': 'Charging', 'thai': 'ชาร์จจิ้ง', 'rule': '42', 'category': 'penalty', 'page': 163,
     'description': 'Rotate both clenched fists around each other in front of the chest.', 'descriptionTh': 'หมุนกำปั้นทั้งสองข้างวนรอบกันหน้าอก',
     'hands': ['fist', 'fist'], 'frames': poses(DOWN_L, DOWN_R, 'rotate')},
    {'id': 'slashing', 'name': 'Slashing', 'thai': 'ฟาดไม้', 'rule': '61', 'category': 'penalty', 'page': 166,
     'description': 'Chop the edge of one hand across the opposite forearm.', 'descriptionTh': 'ใช้สันมือข้างหนึ่งสับลงบนปลายแขนอีกข้าง',
     'hands': ['fist', 'flat'], 'frames': poses([33, 49, 62, 47], [70, 35, 53, 47], 'tap', away_right=[70, 30, 53, 28])},
    {'id': 'wash-out', 'name': 'Wash-out', 'thai': 'ยกเลิก', 'rule': 'Various', 'category': 'play', 'page': 169,
     'description': 'Sweep both arms outward at shoulder height, palms down.', 'descriptionTh': 'กวาดแขนทั้งสองออกด้านข้างระดับไหล่ โดยคว่ำฝ่ามือ',
     'note': 'The meaning depends on the official and situation: no goal, no offside, no icing, and other cancellations.',
     'hands': ['flat', 'flat'], 'frames': poses([24, 33, 8, 33], [76, 33, 92, 33], 'raise', away_left=[38, 43, 56, 38], away_right=[62, 43, 44, 38])},
]


def add(key, name, thai, rule, category, page, description, description_th, left, right,
        hands=('fist', 'fist'), motion='raise', away_left=None, away_right=None, **extra):
    SIGNALS.append(dict(id=key, name=name, thai=thai, rule=rule, category=category, page=page,
                        description=description, descriptionTh=description_th, hands=list(hands),
                        frames=poses(left, right, motion, away_left, away_right), **extra))


add('boarding', 'Boarding', 'บอร์ดดิ้ง · ชนกระดาน', '41', 'penalty', 163,
    'Bring a closed fist into the other hand’s open palm, in front of the chest.', 'กำหมัดทุบฝ่ามืออีกข้างบริเวณหน้าอก',
    [33, 45, 49, 43], [67, 47, 55, 44], ('fist', 'palm'), 'tap', away_left=[32, 37, 43, 32])
add('checking-from-behind', 'Checking from behind', 'ชนจากด้านหลัง', '43', 'penalty', 163,
    'Push both open palms forward from the chest at shoulder level.', 'ดันฝ่ามือทั้งสองไปข้างหน้าจากระดับอก เหยียดแขนระดับไหล่',
    [27, 32, 19, 29], [73, 32, 81, 29], ('palm', 'palm'), 'tap',
    away_left=[35, 46, 44, 37], away_right=[65, 46, 56, 37],
    note='Open palms distinguish this signal from cross-checking, which uses closed fists.')
add('cross-checking', 'Cross-checking', 'ครอสเช็ค', '59', 'penalty', 165,
    'Move both closed fists forward and back from the chest.', 'กำหมัดทั้งสอง ดันออกจากอกแล้วดึงกลับ',
    [27, 35, 23, 32], [73, 35, 77, 32], ('fist', 'fist'), 'tap',
    away_left=[35, 48, 44, 42], away_right=[65, 48, 56, 42],
    note='Keep the fists closed. Open palms are the checking-from-behind signal.')
add('tripping', 'Tripping', 'ขัดขา', '57', 'penalty', 165,
    'Tap the leg below the knee. Both skates stay on the ice.', 'ใช้มือแตะขาส่วนใต้เข่า โดยให้สเกตทั้งสองอยู่บนพื้น',
    [37, 50, 42, 66], [76, 61, 58, 85], ('palm', 'palm'), 'tap',
    away_right=[79, 59, 70, 82], stance='leg', target=[58, 85])
add('kneeing', 'Kneeing', 'ใช้เข่า', '50', 'penalty', 164,
    'Tap the knee with an open hand while both skates remain down.', 'ใช้ฝ่ามือตบเข่า โดยไม่ยกสเกตออกจากพื้น',
    [37, 50, 42, 66], [77, 57, 62, 77], ('palm', 'palm'), 'tap',
    away_right=[80, 55, 73, 74], stance='leg', target=[62, 77])
add('clipping', 'Clipping', 'ตัดขาจากด้านหลัง', '44', 'penalty', 163,
    'Tap the back of the knee. Keep both skates on the ice.', 'ใช้มือแตะบริเวณหลังเข่า โดยให้สเกตทั้งสองอยู่บนพื้น',
    [37, 50, 42, 66], [52, 58, 37, 77], ('palm', 'palm'), 'tap',
    away_right=[56, 57, 45, 70], stance='leg', target=[37, 77])
add('elbowing', 'Elbowing', 'ใช้ศอก', '45', 'penalty', 163,
    'Touch one elbow with the opposite hand.', 'ใช้มือแตะข้อศอกของแขนอีกข้าง',
    [35, 49, 72, 42], [73, 42, 59, 46], ('palm', 'fist'), 'tap', away_left=[34, 50, 63, 54])
add('head-neck', 'Check to head or neck', 'กระแทกศีรษะหรือคอ', '48', 'penalty', 164,
    'Pat the side of the head with the open non-whistle hand.', 'ใช้ฝ่ามือข้างที่ไม่ได้ถือนกหวีดแตะด้านข้างศีรษะ',
    DOWN_L, [73, 26, 60, 18], ('palm', 'palm'), 'tap', away_right=[78, 24, 69, 14])
add('roughing', 'Roughing / Fighting', 'รัฟฟิ่ง · ชกต่อย', '51 / 46', 'penalty', 164,
    'Extend one arm horizontally to the side with a closed fist.', 'กำหมัดแล้วเหยียดแขนออกด้านข้างในแนวนอน',
    DOWN_L, [77, 33, 92, 33], ('palm', 'fist'),
    note='Appendix I groups this gesture as Roughing / Fighting. A flat hand toward the blue line signals offside.')
add('holding', 'Holding', 'จับตัว', '54', 'penalty', 164,
    'Use one hand to grasp the other wrist in front of the chest.', 'ใช้มือข้างหนึ่งจับข้อมืออีกข้างบริเวณหน้าอก',
    [33, 49, 51, 45], [67, 49, 55, 44], ('flat', 'fist'))
add('holding-stick', 'Holding the stick', 'จับไม้', '54', 'penalty', 164,
    'Show holding first, then move both hands into a normal stick grip.', 'ทำท่าจับข้อมือก่อน แล้วทำท่าจับไม้ด้วยสองมือ',
    [35, 49, 54, 47], [70, 43, 69, 36], ('fist', 'fist'),
    away_left=[33, 49, 51, 45], away_right=[67, 49, 55, 44],
    note='This is a two-stage signal: wrist hold, then stick grip.')
add('hooking', 'Hooking', 'เกี่ยว', '55', 'penalty', 165,
    'Pull both hands inward toward the stomach, as if tugging a stick.', 'ทำท่าดึงไม้ด้วยสองมือเข้าหาท้อง',
    [35, 51, 46, 49], [66, 51, 57, 47], ('fist', 'fist'), 'tap',
    away_left=[29, 41, 30, 33], away_right=[74, 39, 73, 30])
add('interference', 'Interference', 'ขัดขวาง', '56 / 69', 'penalty', 165,
    'Cross the forearms into an X on the chest and hold the position.', 'ไขว้แขนเป็นรูป X บริเวณหน้าอกแล้วค้างไว้',
    [36, 49, 62, 37], [64, 49, 38, 37],
    note='The same final crossed-arm pose can be used by a linesperson after an icing call.')
add('butt-ending', 'Butt-ending', 'ใช้ปลายด้ามไม้', '58', 'penalty', 165,
    'Slide a closed-fist forearm underneath the other forearm, which stays palm-down.', 'เลื่อนแขนที่กำหมัดผ่านใต้แขนอีกข้างที่คว่ำฝ่ามือ',
    [34, 53, 61, 49], [68, 41, 43, 41], ('fist', 'flat'), 'tap', away_left=[33, 53, 43, 49])
add('high-sticking', 'High-sticking', 'ไม้สูง', '60', 'penalty', 166,
    'Hold two closed fists at forehead height, one just above the other.', 'กำหมัดสองข้างซ้อนกันระดับหน้าผาก คล้ายกำลังจับไม้',
    [40, 37, 65, 20], [73, 26, 65, 10])
add('spearing', 'Spearing', 'แทง', '62', 'penalty', 166,
    'Jab both hands away from the body, then drop them to the sides.', 'ทำท่าแทงสองมือไปข้างหน้า แล้วลดมือลงข้างลำตัว',
    [28, 37, 27, 31], [74, 37, 76, 31], ('fist', 'fist'),
    away_left=[35, 49, 46, 47], away_right=[65, 49, 56, 45],
    note='Two stages: jab out, then lower both arms. Hooking pulls inward.')
# Include the second stage explicitly instead of simply reversing the jab.
SIGNALS[-1]['frames'] = [
    {'at': at, 'left': l, 'right': r} for at, l, r in [
        (0, [35, 49, 46, 47], [65, 49, 56, 45]),
        (.18, [28, 37, 27, 31], [74, 37, 76, 31]),
        (.32, [28, 37, 27, 31], [74, 37, 76, 31]),
        (.5, DOWN_L, DOWN_R), (.8, DOWN_L, DOWN_R),
        (1, [35, 49, 46, 47], [65, 49, 56, 45])]]
add('delay-game', 'Delay of game', 'ถ่วงเวลา', '63', 'penalty', 166,
    'Slide one flat hand upward from the other hand at the centre of the body.', 'เลื่อนมือแบนขึ้นจากมืออีกข้างบริเวณกลางลำตัว',
    [35, 51, 50, 49], [66, 39, 52, 33], ('flat', 'flat'), 'tap', away_right=[66, 51, 52, 49])
add('diving', 'Diving / Embellishment', 'แกล้งล้ม', '64', 'penalty', 166,
    'Place both hands on the hips; indicate two fingers when appropriate.', 'เท้าสะเอวทั้งสองข้าง และชูสองนิ้วตามสถานการณ์',
    [28, 48, 41, 61], [72, 48, 59, 61])
add('too-many', 'Too many players', 'ผู้เล่นเกิน', '74', 'penalty', 167,
    'Show six fingers in front of the chest: five on one hand and one on the other.', 'ชูหกนิ้วบริเวณหน้าอก โดยแบห้านิ้วข้างหนึ่งและชูหนึ่งนิ้วอีกข้าง',
    [32, 48, 39, 37], [68, 48, 61, 37], ('five', 'point'), fingers=True)
add('unsportsmanlike', 'Unsportsmanlike conduct', 'ไม่มีน้ำใจนักกีฬา', '75', 'penalty', 167,
    'Put both hands on the hips; add the two-finger indication when appropriate.', 'เท้าสะเอวทั้งสองข้าง และชูสองนิ้วตามสถานการณ์',
    [28, 48, 41, 61], [72, 48, 59, 61])
add('body-checking', 'Illegal body check', 'บอดี้เช็คผิดกติกา', '101.1', 'penalty', 168,
    'Bring the non-whistle palm across the chest onto the opposite shoulder.', 'นำฝ่ามือข้างที่ไม่ได้ถือนกหวีดข้ามตัวไปแตะไหล่อีกข้าง',
    DOWN_L, [66, 48, 39, 34], ('palm', 'palm'))
add('penalty-shot', 'Penalty shot', 'ลูกโทษ', '24', 'play', 163,
    'Cross both arms above the head.', 'ไขว้แขนทั้งสองข้างเหนือศีรษะ',
    [30, 17, 59, 3], [70, 17, 41, 3])
add('faceoff-warning', 'Face-off violation warning', 'เตือนการฝ่าฝืนการดรอปลูก', '76', 'play', 167,
    'Bend one arm with its palm up, on the side of the team being warned.', 'งอแขนและหงายฝ่ามือด้านทีมที่ถูกเตือน',
    DOWN_L, [74, 48, 88, 42], ('palm', 'flat'))
add('goal', 'Goal', 'ประตู', '78', 'play', 167,
    'Direct the outstretched hand toward the goal where the puck legally entered.', 'เหยียดมือชี้ไปยังประตูที่ลูกเข้าอย่างถูกกติกา',
    DOWN_L, [77, 40, 92, 46], ('palm', 'point'))
add('hand-pass', 'Hand pass', 'ส่งลูกด้วยมือ', '79', 'play', 167,
    'Push an open palm forward once or twice.', 'ดันฝ่ามือที่แบออกไปข้างหน้าหนึ่งหรือสองครั้ง',
    DOWN_L, [74, 33, 79, 25], ('palm', 'palm'), 'tap', away_right=[65, 47, 58, 39])
add('high-sticking-puck', 'High-sticking the puck', 'เล่นลูกด้วยไม้สูง', '80', 'play', 167,
    'Hold the fists one above the other at forehead level, as if holding a stick.', 'กำหมัดสองข้างซ้อนกันระดับหน้าผาก คล้ายจับไม้',
    [40, 37, 65, 20], [73, 26, 65, 10])
add('icing-signaled', 'Possible icing', 'อาจเป็นไอซิ่ง', '81', 'play', 168,
    'The back linesperson raises an arm overhead and holds it until icing is called or cancelled.', 'ไลน์สแมนด้านหลังชูแขนค้างไว้ จนกว่าจะตัดสินหรือยกเลิกไอซิ่ง',
    DOWN_L, [64, 17, 64, 2], ('palm', 'palm'))
add('icing-called', 'Icing called', 'ไอซิ่ง', '81', 'play', 168,
    'After pointing toward the face-off spot, cross the arms across the chest.', 'หลังชี้จุดดรอปลูก ให้ไขว้แขนบริเวณหน้าอก',
    [36, 49, 62, 37], [64, 49, 38, 37],
    away_left=DOWN_L, away_right=[76, 42, 89, 48],
    note='This animation shows the pointing and crossed-arm gestures. The full procedure also includes skating to the face-off spot.')
add('delayed-offside', 'Delayed offside', 'ล้ำหน้ารอ', '83', 'play', 168,
    'Raise the non-whistle arm vertically with an open hand. Lower it when the delayed offside is cancelled.', 'ชูแขนข้างที่ไม่ได้ถือนกหวีดขึ้นตรง แบมือ และลดแขนลงเมื่อยกเลิก',
    DOWN_L, [64, 17, 64, 2], ('palm', 'palm'))
add('offside-called', 'Offside called', 'ล้ำหน้า', '83', 'play', 168,
    'After the whistle, extend the non-whistle arm toward the blue line.', 'เป่านกหวีด แล้วเหยียดแขนข้างที่ไม่ได้ถือนกหวีดชี้เส้นน้ำเงิน',
    DOWN_L, [77, 33, 92, 33], ('palm', 'flat'),
    note='The hand is open. A closed fist to the side is the roughing signal.')
add('time-out', 'Time-out', 'ขอเวลานอก', '87', 'play', 168,
    'Make a T with both hands in front of the chest.', 'ใช้มือทั้งสองทำเป็นรูปตัว T บริเวณหน้าอก',
    [32, 44, 47, 35], [65, 53, 51, 41], ('flat', 'palm'))

ORDER = ['boarding', 'charging', 'checking-from-behind', 'cross-checking', 'tripping', 'kneeing', 'clipping',
         'elbowing', 'head-neck', 'roughing', 'holding', 'holding-stick', 'hooking', 'spearing', 'interference',
         'butt-ending', 'high-sticking', 'slashing', 'delay-game', 'diving', 'too-many', 'unsportsmanlike',
         'body-checking', 'penalty-shot', 'faceoff-warning', 'goal', 'hand-pass', 'high-sticking-puck',
         'icing-signaled', 'icing-called', 'delayed-offside', 'offside-called', 'time-out', 'wash-out']
SIGNALS.sort(key=lambda signal: ORDER.index(signal['id']))


def frame_at(signal, t):
    frames = signal['frames']
    for a, b in zip(frames, frames[1:]):
        if a['at'] <= t <= b['at']:
            amount = (t - a['at']) / (b['at'] - a['at'])
            return {side: mix(a[side], b[side], amount) for side in ['left', 'right']}
    return frames[-1]


def render(signal, t, size=360):
    scale = 3
    image = Image.new('RGB', (size * scale, size * scale), '#f2f6fb')
    draw = ImageDraw.Draw(image)
    unit = size * scale / 112
    def xy(point):
        return ((point[0] + 6) * unit, (point[1] + 6) * unit)
    def line(points, color='#172437', width=5):
        draw.line([xy(p) for p in points], fill=color, width=max(1, round(width * unit)), joint='curve')
        r = width * unit / 2
        for p in points:
            x, y = xy(p)
            draw.ellipse((x-r, y-r, x+r, y+r), fill=color)
    def ellipse(box, fill, outline='#172437', width=1):
        draw.ellipse((*xy(box[:2]), *xy(box[2:])), fill=fill, outline=outline, width=max(1, round(width*unit)))
    # Ice, trousers and skates stay still while the actual signal moves.
    ellipse([31, 99, 69, 102], '#dce6ef', '#dce6ef', 0)
    line([(45, 64), (44, 92)], width=7)
    line([(55, 64), (56, 92)], width=7)
    line([(38, 96), (48, 96)], '#71859c', 1.5)
    line([(52, 96), (62, 96)], '#71859c', 1.5)
    torso = [(38, 32), (62, 32), (60, 65), (40, 65)]
    draw.polygon([xy(p) for p in torso], fill='#ffffff')
    for x in [40, 46, 52, 58]:
        line([(x, 34), (max(42, min(58, x)), 63)], width=2.5)
    draw.line([xy(p) for p in torso + [torso[0]]], fill='#172437', width=round(1.4*unit))
    draw.rectangle((*xy((46.5, 28)), *xy((53.5, 32))), fill='#efc8a8')
    ellipse([42, 13, 58, 29], '#efc8a8', width=1.3)
    draw.arc((*xy((42, 13)), *xy((58, 29))), 185, 350, fill='#172437', width=round(2.6*unit))
    pose = frame_at(signal, t)
    for side, shoulder, kind in zip(['left', 'right'], [(38, 33), (62, 33)], signal['hands']):
        ex, ey, hx, hy = pose[side]
        line([shoulder, (ex, ey), (hx, hy)], width=5)
        for amount in [.25, .6]:
            sx = shoulder[0] + (ex-shoulder[0])*amount
            sy = shoulder[1] + (ey-shoulder[1])*amount
            ellipse([sx-1, sy-1, sx+1, sy+1], '#ffffff', '#ffffff', 0)
        if kind == 'fist':
            ellipse([hx-3.3, hy-3.3, hx+3.3, hy+3.3], '#efc8a8', width=1)
        else:
            rx, ry = (5, 2.1) if kind == 'flat' else (2.5, 4.7)
            ellipse([hx-rx, hy-ry, hx+rx, hy+ry], '#efc8a8', width=1)
    return image.resize((size, size), Image.Resampling.LANCZOS)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--samples', type=Path)
    args = parser.parse_args()
    target = ROOT / 'src' / 'referee-signals.json'
    target.write_text(json.dumps(SIGNALS, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    if args.samples:
        args.samples.mkdir(parents=True, exist_ok=True)
        for signal in SIGNALS:
            if signal['id'] not in ['charging', 'slashing', 'wash-out']:
                continue
            frames = [render(signal, i/47) for i in range(48)]
            frames[0].save(args.samples / (signal['id'] + '.gif'), save_all=True, append_images=frames[1:], duration=60, loop=0, optimize=True)
            render(signal, 0).save(args.samples / (signal['id'] + '.png'))
        print('Rendered 3 animated samples to', args.samples)
    print('Wrote', len(SIGNALS), 'SVG pose models to', target)


if __name__ == '__main__':
    main()
