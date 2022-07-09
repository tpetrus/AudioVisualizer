function incrementDecimalRgbColor(value: number, step: number) {
    if(value >= 1) {
      return 0;
    }
    else return value + step;
  }

export function rainbowStrobeAnimation(threeColor: THREE.Color) {
    let num = Math.round(Math.random() * 2) / 1;
    switch(num) {
        case 0:
            threeColor.r = incrementDecimalRgbColor(threeColor.r, .5);
            break;
        case 1:
            threeColor.g = incrementDecimalRgbColor(threeColor.g, .5);
            break;
        default:
            threeColor.b = incrementDecimalRgbColor(threeColor.b, .5);
            break;
    }
  }