"""Area for the resort named by $RESORT (default niseko), from tools/resorts.json."""
import json, os

RESORT = os.environ.get('RESORT', 'niseko')
CONFIG = json.load(open(os.path.join(os.path.dirname(__file__), 'resorts.json')))[RESORT]
W, S, E, N = CONFIG['bbox']
FAR = CONFIG['far']
